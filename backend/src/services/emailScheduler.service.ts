import { randomUUID } from "crypto";
import type { EmailRecord } from "../types/email";
import { computeEffectiveDelayMs, computeScheduledAt } from "./pacing";
import { deriveEmailIdempotencyKey } from "./idempotency";
import { findOrCreateSender as findOrCreateSenderDefault } from "../models/sender.model";
import {
  attachBullmqJobId as attachBullmqJobIdDefault,
  createEmailIfNotExists as createEmailIfNotExistsDefault,
} from "../models/email.model";
import { emailQueue } from "../queues/email.queue";
import { env } from "../config/env";

import { indexEmailDocument as indexEmailDocumentDefault } from "./elasticsearch.service";

export interface ScheduleEmailsParams {
  user: { id: string; email: string };
  sender: string;
  recipient?: string;
  recipients?: string[];
  subject: string;
  body: string;
  startTime?: string;
  delayBetweenEmailsMs?: number;
  hourlyLimit?: number;
  idempotencyKey?: string;
}

export interface ScheduledEmailResult {
  id: string;
  recipient: string;
  status: EmailRecord["status"];
  scheduledAt: Date | null;
  sentAt: Date | null;
  bullmqJobId: string | null;
  /** true if this call reused an existing row/job instead of creating a new one. */
  idempotentReplay: boolean;
}

export interface ScheduleEmailsResult {
  idempotencyKey: string;
  pacing: {
    requestedDelayMs: number;
    effectiveDelayMs: number;
    hourlyLimit: number;
  };
  startTime: Date;
  emails: ScheduledEmailResult[];
}

/**
 * Dependencies are injected (with real implementations as defaults) purely
 * so the ordering/idempotency logic below can be unit-tested without a real
 * Postgres or Redis connection.
 */
export interface EmailSchedulerDeps {
  findOrCreateSender: typeof findOrCreateSenderDefault;
  createEmailIfNotExists: typeof createEmailIfNotExistsDefault;
  attachBullmqJobId: typeof attachBullmqJobIdDefault;
  enqueueJob: (emailId: string, delayMs: number) => Promise<string>;
  indexEmailDocument: typeof indexEmailDocumentDefault;
  now: () => Date;
}

const defaultDeps: EmailSchedulerDeps = {
  findOrCreateSender: findOrCreateSenderDefault,
  createEmailIfNotExists: createEmailIfNotExistsDefault,
  attachBullmqJobId: attachBullmqJobIdDefault,
  enqueueJob: async (emailId, delayMs) => {
    // Using the email's own id as the BullMQ job id makes enqueueing itself
    // idempotent: calling queue.add twice with the same jobId does not
    // create a second job (as long as the first hasn't completed/been
    // removed), which is exactly the "don't double-enqueue" guarantee we
    // want on top of the DB-level idempotency check below.
    const job = await emailQueue.add(
      "send-email",
      { emailId },
      { jobId: emailId, delay: delayMs }
    );
    return job.id ?? emailId;
  },
  indexEmailDocument: (email) => indexEmailDocumentDefault(email),
  now: () => new Date(),
};

function toResult(email: EmailRecord, idempotentReplay: boolean): ScheduledEmailResult {
  return {
    id: email.id,
    recipient: email.recipient,
    status: email.status,
    scheduledAt: email.scheduled_at,
    sentAt: email.sent_at,
    bullmqJobId: email.bullmq_job_id,
    idempotentReplay,
  };
}

/**
 * Persists a row for one recipient, then enqueues a BullMQ delayed job for
 * it - unless it turns out one already exists.
 *
 * Three cases land here:
 *  1. Brand-new email -> insert row, enqueue job, store job id. Normal path.
 *  2. Row already exists AND already has a bullmq_job_id -> some earlier
 *     call (or an idempotent replay of this same request) already scheduled
 *     it; do nothing further and return the existing state.
 *  3. Row already exists but bullmq_job_id IS NULL -> a previous request
 *     persisted the row and then crashed/errored before it could enqueue
 *     the job. We recover here by enqueueing now, rather than leaving the
 *     email stuck unscheduled forever.
 * Case 3 is also why "already sent" is checked explicitly: if the row is
 * already `sent`, we must never re-enqueue regardless of bullmq_job_id.
 */
async function persistAndEnqueue(
  deps: EmailSchedulerDeps,
  input: Parameters<EmailSchedulerDeps["createEmailIfNotExists"]>[0],
  scheduledAt: Date
): Promise<ScheduledEmailResult> {
  const { email, created } = await deps.createEmailIfNotExists(input);

  if (email.status === "sent" || email.bullmq_job_id) {
    // Case 2 (or already sent): nothing left to do.
    await deps.indexEmailDocument(email);
    return toResult(email, !created);
  }

  // Case 1 or Case 3: needs a job.
  const delayMs = Math.max(0, scheduledAt.getTime() - deps.now().getTime());
  const jobId = await deps.enqueueJob(email.id, delayMs);
  const updated = await deps.attachBullmqJobId(email.id, jobId);

  await deps.indexEmailDocument(updated);

  return toResult(updated, !created);
}

export async function scheduleEmails(
  params: ScheduleEmailsParams,
  deps: EmailSchedulerDeps = defaultDeps
): Promise<ScheduleEmailsResult> {
  const rawRecipients = params.recipients?.length ? params.recipients : [params.recipient!];
  const recipients = Array.from(new Set(rawRecipients.map((r) => r.trim().toLowerCase())));

  const startTime = params.startTime ? new Date(params.startTime) : deps.now();
  const requestedDelayMs = params.delayBetweenEmailsMs ?? env.DEFAULT_SEND_DELAY_MS;
  const hourlyLimit = params.hourlyLimit ?? env.DEFAULT_HOURLY_LIMIT;
  const { effectiveDelayMs } = computeEffectiveDelayMs({ requestedDelayMs, hourlyLimit });

  // If the caller doesn't supply an idempotency key, generate one for this
  // request only. That still prevents duplicates *within* this single call
  // (e.g. the same recipient listed twice), but a retried HTTP request with
  // no key will be treated as a brand-new batch - callers that need
  // cross-retry protection must pass their own key.
  const batchKey = params.idempotencyKey ?? randomUUID();

  const sender = await deps.findOrCreateSender(params.user.id, params.sender, undefined, hourlyLimit);

  const emails: ScheduledEmailResult[] = [];
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const scheduledAt = computeScheduledAt(startTime, i, effectiveDelayMs);
    const idempotencyKey = deriveEmailIdempotencyKey(batchKey, recipient);

    const result = await persistAndEnqueue(
      deps,
      {
        userId: params.user.id,
        senderId: sender.id,
        sender: sender.email,
        recipient,
        subject: params.subject,
        body: params.body,
        scheduledAt,
        idempotencyKey,
      },
      scheduledAt
    );

    emails.push(result);
  }

  return {
    idempotencyKey: batchKey,
    pacing: { requestedDelayMs, effectiveDelayMs, hourlyLimit },
    startTime,
    emails,
  };
}
