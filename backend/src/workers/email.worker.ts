import { DelayedError, UnrecoverableError, Worker, type Job } from "bullmq";
import { redis } from "../config/redis";
import { env } from "../config/env";
import {
  findEmailWithSenderLimitById as findEmailByIdDefault,
  incrementAttempts as incrementAttemptsDefault,
  rescheduleEmail as rescheduleEmailDefault,
  updateEmailStatus as updateEmailStatusDefault,
} from "../models/email.model";
import { sendMail as sendMailDefault } from "../config/mailer";
import { createRedisAtomics } from "../services/redisAtomics";
import { checkAndConsumeHourlyLimit as checkAndConsumeHourlyLimitDefault } from "../services/rateLimiter.service";
import { reserveSendSlot as reserveSendSlotDefault } from "../services/sendPacing.service";
import { notifyRateLimitReached as notifyRateLimitReachedDefault } from "../services/slackNotifier.service";
import { updateEmailDocumentStatus as updateEmailDocumentStatusDefault } from "../services/elasticsearch.service";
import type { EmailWithSenderLimit } from "../types/email";

export interface EmailJobData {
  emailId: string;
}

export type EmailJobOutcome =
  | { outcome: "skipped"; reason: "already-sent" | "cancelled" }
  | { outcome: "rescheduled"; reason: "rate-limit" | "pacing"; nextAttemptAt: Date }
  | { outcome: "sent"; messageId: string; previewUrl: string | false };

/**
 * Dependencies are injected so the send/skip/retry/rate-limit/pacing
 * decision logic below can be unit-tested without a real Postgres, Redis,
 * or SMTP connection.
 */
export interface EmailWorkerDeps {
  findEmailById: (id: string) => Promise<EmailWithSenderLimit | null>;
  updateEmailStatus: typeof updateEmailStatusDefault;
  incrementAttempts: typeof incrementAttemptsDefault;
  rescheduleEmail: typeof rescheduleEmailDefault;
  sendMail: typeof sendMailDefault;
  checkAndConsumeHourlyLimit: (
    senderId: string,
    limit: number,
    now: Date
  ) => ReturnType<typeof checkAndConsumeHourlyLimitDefault>;
  reserveSendSlot: (
    senderId: string,
    emailId: string,
    minDelayMs: number,
    now: Date
  ) => ReturnType<typeof reserveSendSlotDefault>;
  notifyRateLimitReached: (event: {
    senderId: string;
    senderEmail: string;
    limit: number;
    hourWindowKey: string;
    nextAvailableAt: Date;
  }) => ReturnType<typeof notifyRateLimitReachedDefault>;
  updateEmailDocumentStatus: typeof updateEmailDocumentStatusDefault;
  now: () => Date;
}

const sharedAtomics = createRedisAtomics(redis);

export const defaultWorkerDeps: EmailWorkerDeps = {
  findEmailById: findEmailByIdDefault,
  updateEmailStatus: updateEmailStatusDefault,
  incrementAttempts: incrementAttemptsDefault,
  rescheduleEmail: rescheduleEmailDefault,
  sendMail: sendMailDefault,
  checkAndConsumeHourlyLimit: (senderId, limit, now) =>
    checkAndConsumeHourlyLimitDefault(sharedAtomics, senderId, limit, now),
  reserveSendSlot: (senderId, emailId, minDelayMs, now) =>
    reserveSendSlotDefault(sharedAtomics, senderId, emailId, minDelayMs, now),
  notifyRateLimitReached: (event) =>
    notifyRateLimitReachedDefault(event, { atomics: sharedAtomics, slackWebhookUrl: env.SLACK_WEBHOOK_URL }),
  updateEmailDocumentStatus: (id, status, opts) => updateEmailDocumentStatusDefault(id, status, opts),
  now: () => new Date(),
};

/**
 * Processes a single "send-email" job.
 *
 * Decision order, each independently distinguishable from a send failure:
 *  1. Already `sent` / `cancelled` -> acknowledge as a no-op (retry-safe).
 *  2. Sender's minimum-delay pacing slot not yet open -> defer the job to
 *     whenever Redis says the next slot opens for this (senderId, emailId).
 *     Rate limiting is NOT checked or consumed until the job is ready to send.
 *  3. Sender's hourly quota exhausted -> reschedule to the next UTC hour,
 *     fire the Slack notification hook, and defer via DelayedError without
 *     touching `attempts`.
 *  4. Otherwise -> actually send. A thrown error here IS a real failure.
 */
export async function processEmailJob(
  data: EmailJobData,
  deps: EmailWorkerDeps = defaultWorkerDeps
): Promise<EmailJobOutcome> {
  const email = await deps.findEmailById(data.emailId);

  if (!email) {
    // No point retrying a job whose DB row doesn't exist.
    throw new UnrecoverableError(`Email record ${data.emailId} not found`);
  }

  if (email.status === "sent") {
    return { outcome: "skipped", reason: "already-sent" };
  }
  if (email.status === "cancelled") {
    return { outcome: "skipped", reason: "cancelled" };
  }

  const now = deps.now();

  // --- 1. Distributed minimum-delay pacing (per sender + per job) ---
  const slot = await deps.reserveSendSlot(email.sender_id, email.id, env.DEFAULT_SEND_DELAY_MS, now);
  if (slot.nextAllowedAt.getTime() > now.getTime()) {
    await deps.rescheduleEmail(email.id, slot.nextAllowedAt);
    await deps.updateEmailDocumentStatus(email.id, "scheduled");
    return { outcome: "rescheduled", reason: "pacing", nextAttemptAt: slot.nextAllowedAt };
  }

  // --- 2. Distributed hourly rate limit (per sender) ---
  // Evaluated ONLY when the job is ready to send in the current window.
  // The final rate-limit decision is made using the actual current UTC time immediately
  // before send, never caching from initial job pickup, pacing reservation, or scheduled time.
  const currentUtcTime = deps.now();
  const rateLimit = await deps.checkAndConsumeHourlyLimit(email.sender_id, email.hourly_limit, currentUtcTime);
  if (!rateLimit.allowed) {
    await deps.notifyRateLimitReached({
      senderId: email.sender_id,
      senderEmail: email.sender,
      limit: rateLimit.limit,
      hourWindowKey: rateLimit.hourWindowKey,
      nextAvailableAt: rateLimit.nextHourStart,
    });
    await deps.rescheduleEmail(email.id, rateLimit.nextHourStart);
    await deps.updateEmailDocumentStatus(email.id, "scheduled");
    return { outcome: "rescheduled", reason: "rate-limit", nextAttemptAt: rateLimit.nextHourStart };
  }

  // --- 3. Actually send ---
  await deps.updateEmailStatus(email.id, "processing");
  await deps.updateEmailDocumentStatus(email.id, "processing");
  await deps.incrementAttempts(email.id);

  try {
    const result = await deps.sendMail({
      from: email.sender,
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });

    // See crash-window note in the function doc comment above.
    const sentAt = deps.now();
    await deps.updateEmailStatus(email.id, "sent", { sentAt });
    await deps.updateEmailDocumentStatus(email.id, "sent", { sentAt });

    return { outcome: "sent", messageId: result.messageId, previewUrl: result.previewUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.updateEmailStatus(email.id, "failed", { lastError: message });
    await deps.updateEmailDocumentStatus(email.id, "failed", { lastError: message });
    throw err; // rethrow so BullMQ applies retry/backoff per queue defaultJobOptions
  }
}

export async function executeEmailJob(
  job: { id?: string; data: EmailJobData; moveToDelayed: (timestamp: number, token: string) => Promise<void> },
  token?: string,
  deps: EmailWorkerDeps = defaultWorkerDeps
): Promise<EmailJobOutcome> {
  const outcome = await processEmailJob(job.data, deps);

  if (outcome.outcome === "rescheduled") {
    // The BullMQ-supported way to defer a job without it counting as a
    // failed attempt: move it back to the delayed set ourselves, then
    // signal BullMQ via DelayedError so it doesn't also mark it
    // completed/failed. Same job id -> no duplicate logical email.
    if (!token) {
      // Should not happen in practice (BullMQ always supplies a token
      // to the processor), but fail loudly rather than silently
      // dropping the reschedule if it ever does.
      throw new Error(`Missing job token while rescheduling job ${job.id}`);
    }
    await job.moveToDelayed(outcome.nextAttemptAt.getTime(), token);
    throw new DelayedError();
  }

  return outcome;
}

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    env.EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>, token?: string) => {
      return executeEmailJob(job, token);
    },
    {
      connection: redis,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on("completed", (job, result: EmailJobOutcome) => {
    if (result.outcome === "skipped") {
      console.log(`⏭️  Job ${job.id} skipped (${result.reason}) for email ${job.data.emailId}`);
    } else if (result.outcome === "sent") {
      console.log(`✅ Job ${job.id} sent email ${job.data.emailId} (messageId=${result.messageId})`);
      if (result.previewUrl) {
        console.log(`   Preview: ${result.previewUrl}`);
      }
    }
    // "rescheduled" never reaches here - it throws DelayedError instead of completing.
  });

  worker.on("failed", (job, err) => {
    if (err instanceof DelayedError) return; // expected control-flow, not a real failure
    console.error(
      `❌ Job ${job?.id} failed for email ${job?.data.emailId} (attempt ${job?.attemptsMade}): ${err.message}`
    );
  });

  worker.on("error", (err) => {
    console.error("❌ Worker error:", err.message);
  });

  return worker;
}
