import { describe, expect, it, vi } from "vitest";
import { DelayedError, UnrecoverableError } from "bullmq";
import { executeEmailJob, processEmailJob, type EmailWorkerDeps } from "../email.worker";
import type { EmailWithSenderLimit } from "../../types/email";
import { createFakeAtomics } from "../../services/__tests__/fakeAtomics";
import { checkAndConsumeHourlyLimit as checkAndConsumeHourlyLimitReal } from "../../services/rateLimiter.service";
import { reserveSendSlot as reserveSendSlotReal } from "../../services/sendPacing.service";

function makeEmail(overrides: Partial<EmailWithSenderLimit> = {}): EmailWithSenderLimit {
  return {
    id: "email-1",
    user_id: "user-1",
    sender_id: "sender-1",
    idempotency_key: "key-1",
    sender: "sender@example.com",
    recipient: "to@example.com",
    subject: "Hi",
    body: "Hello",
    status: "queued",
    scheduled_at: new Date("2026-01-01T10:00:00.000Z"),
    sent_at: null,
    bullmq_job_id: "job-1",
    attempts: 0,
    last_error: null,
    hourly_limit: 100,
    created_at: new Date("2026-01-01T10:00:00.000Z"),
    updated_at: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

/** Permissive defaults: rate limit always allows, pacing gate always open now. */
function makeDeps(
  email: EmailWithSenderLimit | null,
  overrides: Partial<EmailWorkerDeps> = {}
): {
  deps: EmailWorkerDeps;
  statusUpdates: Array<{ status: string; opts: unknown }>;
  reschedules: Array<{ id: string; scheduledAt: Date }>;
} {
  const statusUpdates: Array<{ status: string; opts: unknown }> = [];
  const reschedules: Array<{ id: string; scheduledAt: Date }> = [];
  const fixedNow = email?.scheduled_at ?? new Date("2026-01-01T10:00:00.000Z");

  const deps: EmailWorkerDeps = {
    findEmailById: vi.fn(async () => email),
    updateEmailStatus: vi.fn(async (id, status, opts = {}) => {
      statusUpdates.push({ status, opts });
      return { ...(email ?? makeEmail()), id, status, ...opts } as EmailWithSenderLimit;
    }),
    incrementAttempts: vi.fn(async (id) => ({ ...(email ?? makeEmail()), id }) as EmailWithSenderLimit),
    rescheduleEmail: vi.fn(async (id, scheduledAt) => {
      reschedules.push({ id, scheduledAt });
      return { ...(email ?? makeEmail()), id, status: "scheduled", scheduled_at: scheduledAt } as EmailWithSenderLimit;
    }),
    sendMail: vi.fn(async () => ({ messageId: "msg-1", previewUrl: "https://ethereal.email/message/msg-1" })),
    checkAndConsumeHourlyLimit: vi.fn(async (senderId, limit, now) => ({
      allowed: true,
      senderId,
      limit,
      hourWindowStart: now,
      hourWindowKey: now.toISOString(),
      nextHourStart: new Date(now.getTime() + 3_600_000),
    })),
    reserveSendSlot: vi.fn(async (_senderId, _emailId, _minDelayMs, now) => ({ nextAllowedAt: now })),
    notifyRateLimitReached: vi.fn(async () => ({ sent: false, reason: "no-slack-connection" as const })),
    updateEmailDocumentStatus: vi.fn(async () => {}),
    now: () => fixedNow,
    ...overrides,
  };

  return { deps, statusUpdates, reschedules };
}

describe("processEmailJob - send / skip / failure (rate limit and pacing both permissive)", () => {
  it("sends the email and marks it sent on success", async () => {
    const email = makeEmail({ status: "queued" });
    const { deps, statusUpdates } = makeDeps(email);

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(outcome).toEqual({
      outcome: "sent",
      messageId: "msg-1",
      previewUrl: "https://ethereal.email/message/msg-1",
    });
    expect(deps.sendMail).toHaveBeenCalledWith({
      from: email.sender,
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });
    expect(statusUpdates.map((u) => u.status)).toEqual(["processing", "sent"]);
    expect(deps.incrementAttempts).toHaveBeenCalledWith(email.id);
  });

  it("skips (does not send) an email that is already sent", async () => {
    const email = makeEmail({ status: "sent", sent_at: new Date() });
    const { deps, statusUpdates } = makeDeps(email);

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(outcome).toEqual({ outcome: "skipped", reason: "already-sent" });
    expect(deps.sendMail).not.toHaveBeenCalled();
    expect(statusUpdates).toHaveLength(0);
    expect(deps.incrementAttempts).not.toHaveBeenCalled();
    expect(deps.checkAndConsumeHourlyLimit).not.toHaveBeenCalled();
  });

  it("skips a cancelled email", async () => {
    const email = makeEmail({ status: "cancelled" });
    const { deps } = makeDeps(email);

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(outcome).toEqual({ outcome: "skipped", reason: "cancelled" });
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  it("throws UnrecoverableError (no retry) when the email row does not exist", async () => {
    const { deps } = makeDeps(null);

    await expect(processEmailJob({ emailId: "missing" }, deps)).rejects.toBeInstanceOf(
      UnrecoverableError
    );
  });

  it("marks the email failed and rethrows when sendMail fails, so BullMQ retries", async () => {
    const email = makeEmail({ status: "queued" });
    const { deps, statusUpdates } = makeDeps(email, {
      sendMail: vi.fn(async () => {
        throw new Error("SMTP connection refused");
      }),
    });

    await expect(processEmailJob({ emailId: email.id }, deps)).rejects.toThrow(
      "SMTP connection refused"
    );

    expect(statusUpdates.map((u) => u.status)).toEqual(["processing", "failed"]);
    expect(statusUpdates[1].opts).toMatchObject({ lastError: "SMTP connection refused" });
    expect(deps.incrementAttempts).toHaveBeenCalledTimes(1);
  });

  it("is retry-safe: a redelivered job for an already-sent email is skipped, not resent", async () => {
    const email = makeEmail({ status: "sent", attempts: 1 });
    const { deps } = makeDeps(email);

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(outcome).toEqual({ outcome: "skipped", reason: "already-sent" });
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  it("still attempts a redelivered job when the previous attempt only got as far as `failed`", async () => {
    const email = makeEmail({ status: "failed", attempts: 1, last_error: "timeout" });
    const { deps } = makeDeps(email);

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(deps.sendMail).toHaveBeenCalledTimes(1);
    expect(outcome.outcome).toBe("sent");
  });
});

describe("processEmailJob - minimum-delay pacing & infinite rescheduling fix", () => {
  it("reschedules (does not send) when the pacing slot has not opened yet", async () => {
    const email = makeEmail({ status: "queued" });
    const nextAllowedAt = new Date(email.scheduled_at!.getTime() + 5_000);

    const { deps, statusUpdates, reschedules } = makeDeps(email, {
      reserveSendSlot: vi.fn(async () => ({ nextAllowedAt })),
    });

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(outcome).toEqual({ outcome: "rescheduled", reason: "pacing", nextAttemptAt: nextAllowedAt });
    expect(deps.sendMail).not.toHaveBeenCalled();
    expect(statusUpdates).toHaveLength(0);
    expect(deps.incrementAttempts).not.toHaveBeenCalled();
    expect(reschedules).toEqual([{ id: email.id, scheduledAt: nextAllowedAt }]);
  });

  it("does NOT consume a rate-limit slot when pacing defers the job", async () => {
    const email = makeEmail({ status: "queued" });
    const nextAllowedAt = new Date(email.scheduled_at!.getTime() + 5_000);

    const { deps } = makeDeps(email, {
      reserveSendSlot: vi.fn(async () => ({ nextAllowedAt })),
    });

    await processEmailJob({ emailId: email.id }, deps);

    expect(deps.checkAndConsumeHourlyLimit).not.toHaveBeenCalled();
  });

  it("sends immediately when the reserved slot is now (no wait)", async () => {
    const email = makeEmail({ status: "queued" });
    const { deps } = makeDeps(email, {
      reserveSendSlot: vi.fn(async (_senderId, _emailId, _delay, now) => ({ nextAllowedAt: now })),
    });

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(outcome.outcome).toBe("sent");
    expect(deps.sendMail).toHaveBeenCalledTimes(1);
  });

  it("passes the email's sender id and email id through to the pacing gate", async () => {
    const email = makeEmail({ id: "email-99", status: "queued", sender_id: "sender-Z" });
    const { deps } = makeDeps(email);

    await processEmailJob({ emailId: email.id }, deps);

    expect(deps.reserveSendSlot).toHaveBeenCalledWith(
      "sender-Z",
      "email-99",
      expect.any(Number),
      expect.any(Date)
    );
  });

  it("proves a delayed job eventually sends and does not endlessly reschedule", async () => {
    const atomics = createFakeAtomics();
    const t0 = new Date("2026-01-01T10:00:00.000Z");
    const delayMs = 2000;

    const emailA = makeEmail({ id: "email-A", sender_id: "sender-1", scheduled_at: t0 });
    const emailB = makeEmail({ id: "email-B", sender_id: "sender-1", scheduled_at: t0 });

    const db = new Map<string, EmailWithSenderLimit>([
      ["email-A", emailA],
      ["email-B", emailB],
    ]);

    const createDepsForTime = (time: Date): EmailWorkerDeps => ({
      findEmailById: vi.fn(async (id) => db.get(id) ?? null),
      updateEmailStatus: vi.fn(async (id, status, opts = {}) => {
        const row = db.get(id)!;
        const updated = { ...row, status: status as any, ...opts };
        db.set(id, updated);
        return updated as any;
      }),
      incrementAttempts: vi.fn(async (id) => db.get(id)! as any),
      rescheduleEmail: vi.fn(async (id, scheduledAt) => {
        const row = db.get(id)!;
        const updated = { ...row, status: "scheduled" as const, scheduled_at: scheduledAt };
        db.set(id, updated);
        return updated as any;
      }),
      sendMail: vi.fn(async () => ({ messageId: `msg-${Date.now()}`, previewUrl: false as const })),
      checkAndConsumeHourlyLimit: (senderId, limit, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now),
      reserveSendSlot: (senderId, emailId, minDelayMs, now) =>
        reserveSendSlotReal(atomics, senderId, emailId, minDelayMs, now),
      notifyRateLimitReached: vi.fn(async () => ({ sent: false, reason: "no-slack-connection" as const })),
      updateEmailDocumentStatus: vi.fn(async () => {}),
      now: () => time,
    });

    // Step 1: Worker 1 processes Job A at T=10:00:00
    const depsA = createDepsForTime(t0);
    const outcomeA = await processEmailJob({ emailId: "email-A" }, depsA);
    expect(outcomeA.outcome).toBe("sent");

    // Step 2: Worker 2 processes Job B at T=10:00:00 -> gets delayed to 10:00:02
    const depsB_1 = createDepsForTime(t0);
    const outcomeB_1 = await processEmailJob({ emailId: "email-B" }, depsB_1);
    expect(outcomeB_1.outcome).toBe("rescheduled");
    if (outcomeB_1.outcome === "rescheduled") {
      expect(outcomeB_1.reason).toBe("pacing");
      expect(outcomeB_1.nextAttemptAt.getTime()).toBe(t0.getTime() + delayMs);
    }

    // Step 3: Job B wakes up at T=10:00:02
    const t2 = new Date(t0.getTime() + delayMs);
    const depsB_2 = createDepsForTime(t2);
    const outcomeB_2 = await processEmailJob({ emailId: "email-B" }, depsB_2);

    // Job B MUST send, NOT reschedule to 10:00:04!
    expect(outcomeB_2.outcome).toBe("sent");
    expect(db.get("email-B")?.status).toBe("sent");
  });
});

describe("processEmailJob - hourly rate limit & hour boundary", () => {
  it("reschedules to the next hour window and does NOT send when the sender's quota is exhausted", async () => {
    const email = makeEmail({ status: "queued", sender_id: "sender-A", hourly_limit: 2 });
    const nextHourStart = new Date(email.scheduled_at!.getTime() + 3_600_000);

    const { deps, statusUpdates, reschedules } = makeDeps(email, {
      checkAndConsumeHourlyLimit: vi.fn(async (senderId, limit, now) => ({
        allowed: false,
        senderId,
        limit,
        hourWindowStart: now,
        hourWindowKey: now.toISOString(),
        nextHourStart,
      })),
    });

    const outcome = await processEmailJob({ emailId: email.id }, deps);

    expect(outcome).toEqual({ outcome: "rescheduled", reason: "rate-limit", nextAttemptAt: nextHourStart });
    expect(deps.sendMail).not.toHaveBeenCalled();
    expect(statusUpdates).toHaveLength(0);
    expect(deps.incrementAttempts).not.toHaveBeenCalled();
    expect(reschedules).toEqual([{ id: email.id, scheduledAt: nextHourStart }]);
  });

  it("evaluates rate limit for the target send hour when pacing pushes across an hour boundary", async () => {
    const atomics = createFakeAtomics();
    // 10:59:59
    const t0 = new Date("2026-01-01T10:59:59.000Z");
    const delayMs = 5000; // pushes to 11:00:04

    const emailA = makeEmail({ id: "email-A", sender_id: "sender-1", scheduled_at: t0 });
    const emailB = makeEmail({ id: "email-B", sender_id: "sender-1", scheduled_at: t0 });

    const db = new Map<string, EmailWithSenderLimit>([
      ["email-A", emailA],
      ["email-B", emailB],
    ]);

    const createDepsForTime = (time: Date): EmailWorkerDeps => ({
      findEmailById: vi.fn(async (id) => db.get(id) ?? null),
      updateEmailStatus: vi.fn(async (id, status, opts = {}) => {
        const row = db.get(id)!;
        const updated = { ...row, status: status as any, ...opts };
        db.set(id, updated);
        return updated as any;
      }),
      incrementAttempts: vi.fn(async (id) => db.get(id)! as any),
      rescheduleEmail: vi.fn(async (id, scheduledAt) => {
        const row = db.get(id)!;
        const updated = { ...row, status: "scheduled" as const, scheduled_at: scheduledAt };
        db.set(id, updated);
        return updated as any;
      }),
      sendMail: vi.fn(async () => ({ messageId: "msg-1", previewUrl: false as const })),
      checkAndConsumeHourlyLimit: vi.fn(
        (senderId, limit, now) => checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now)
      ),
      reserveSendSlot: (senderId, emailId, minDelayMs, now) =>
        reserveSendSlotReal(atomics, senderId, emailId, minDelayMs, now),
      notifyRateLimitReached: vi.fn(async () => ({ sent: false, reason: "no-slack-connection" as const })),
      updateEmailDocumentStatus: vi.fn(async () => {}),
      now: () => time,
    });

    // Job A sends at 10:59:59
    const depsA = createDepsForTime(t0);
    await processEmailJob({ emailId: "email-A" }, depsA);

    // Job B evaluated at 10:59:59 -> pacing defers to 11:00:04
    const depsB_1 = createDepsForTime(t0);
    const outcomeB_1 = await processEmailJob({ emailId: "email-B" }, depsB_1);
    expect(outcomeB_1.outcome).toBe("rescheduled");
    // Notice rate limit was NOT checked at 10:59:59 for Job B!
    expect(depsB_1.checkAndConsumeHourlyLimit).not.toHaveBeenCalled();

    // At 11:00:04, Job B wakes up
    const t11 = new Date(t0.getTime() + delayMs);
    const depsB_2 = createDepsForTime(t11);
    const outcomeB_2 = await processEmailJob({ emailId: "email-B" }, depsB_2);

    // Rate limit WAS checked at 11:00:04 (evaluating hour 11:00 quota)!
    expect(depsB_2.checkAndConsumeHourlyLimit).toHaveBeenCalledWith("sender-1", 100, t11);
    expect(outcomeB_2.outcome).toBe("sent");
  });

  it("keeps multiple senders independent for pacing and rate limiting", async () => {
    const atomics = createFakeAtomics();
    const t0 = new Date("2026-01-01T10:00:00.000Z");

    const emailS1 = makeEmail({ id: "email-S1", sender_id: "sender-1", scheduled_at: t0 });
    const emailS2 = makeEmail({ id: "email-S2", sender_id: "sender-2", scheduled_at: t0 });

    const createDeps = (email: EmailWithSenderLimit): EmailWorkerDeps => ({
      findEmailById: vi.fn(async () => email),
      updateEmailStatus: vi.fn(async (id, status, opts = {}) => ({ ...email, id, status: status as any, ...opts }) as any),
      incrementAttempts: vi.fn(async () => email as any),
      rescheduleEmail: vi.fn(async (id, scheduledAt) => ({ ...email, id, status: "scheduled" as const, scheduled_at: scheduledAt }) as any),
      sendMail: vi.fn(async () => ({ messageId: "msg-1", previewUrl: false as const })),
      checkAndConsumeHourlyLimit: (senderId, limit, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now),
      reserveSendSlot: (senderId, emailId, minDelayMs, now) =>
        reserveSendSlotReal(atomics, senderId, emailId, minDelayMs, now),
      notifyRateLimitReached: vi.fn(async () => ({ sent: false, reason: "no-slack-connection" as const })),
      updateEmailDocumentStatus: vi.fn(async () => {}),
      now: () => t0,
    });

    const res1 = await processEmailJob({ emailId: "email-S1" }, createDeps(emailS1));
    const res2 = await processEmailJob({ emailId: "email-S2" }, createDeps(emailS2));

    expect(res1.outcome).toBe("sent");
    expect(res2.outcome).toBe("sent");
  });
});

describe("processEmailJob - hour boundary regression tests (Req 6 & Req 7)", () => {
  it("evaluates rate limit against the 13:00 UTC window when pacing pushes across hour boundary (12:59:59 -> 13:00:01)", async () => {
    const atomics = createFakeAtomics();
    const spyIncr = vi.spyOn(atomics, "incrIfUnderLimit");
    const t12_59_59 = new Date("2026-01-01T12:59:59.000Z");
    const t13_00_01 = new Date("2026-01-01T13:00:01.000Z");

    // Sender has hourly_limit = 1
    const email1 = makeEmail({ id: "email-1", sender_id: "sender-boundary", hourly_limit: 1, scheduled_at: t12_59_59 });
    const email2 = makeEmail({ id: "email-2", sender_id: "sender-boundary", hourly_limit: 1, scheduled_at: t12_59_59 });

    const db = new Map<string, EmailWithSenderLimit>([
      ["email-1", email1],
      ["email-2", email2],
    ]);
    const sentMails: Array<{ from: string; to: string; subject: string }> = [];

    let currentTime = t12_59_59;
    const createDeps = (): EmailWorkerDeps => ({
      findEmailById: vi.fn(async (id) => db.get(id) ?? null),
      updateEmailStatus: vi.fn(async (id, status, opts = {}) => {
        const row = db.get(id)!;
        const updated = { ...row, status: status as any, ...opts };
        db.set(id, updated);
        return updated as any;
      }),
      incrementAttempts: vi.fn(async (id) => {
        const row = db.get(id)!;
        const updated = { ...row, attempts: row.attempts + 1 };
        db.set(id, updated);
        return updated as any;
      }),
      rescheduleEmail: vi.fn(async (id, scheduledAt) => {
        const row = db.get(id)!;
        const updated = { ...row, status: "scheduled" as const, scheduled_at: scheduledAt };
        db.set(id, updated);
        return updated as any;
      }),
      sendMail: vi.fn(async (mail) => {
        sentMails.push(mail);
        return { messageId: `msg-${mail.to}`, previewUrl: false as const };
      }),
      checkAndConsumeHourlyLimit: (senderId, limit, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now),
      reserveSendSlot: (senderId, emailId, minDelay, now) =>
        reserveSendSlotReal(atomics, senderId, emailId, minDelay, now),
      notifyRateLimitReached: vi.fn(async () => ({ sent: false, reason: "no-slack-connection" as const })),
      updateEmailDocumentStatus: vi.fn(async () => {}),
      now: () => currentTime,
    });

    const deps = createDeps();

    // 1. Email 1 is sent at 12:59:59 UTC, consuming 12:00:00 quota (1/1)
    currentTime = t12_59_59;
    const outcome1 = await processEmailJob({ emailId: "email-1" }, deps);
    expect(outcome1.outcome).toBe("sent");
    expect(sentMails).toHaveLength(1);
    expect(db.get("email-1")?.status).toBe("sent");
    expect(db.get("email-1")?.attempts).toBe(1);

    // Verify correct 12:00 Redis key was used
    expect(spyIncr).toHaveBeenCalledWith("email-rate:sender-boundary:2026-01-01T12:00:00.000Z", 1, expect.any(Number));

    // Verify 12:00 quota is now completely exhausted
    const check12 = await checkAndConsumeHourlyLimitReal(atomics, "sender-boundary", 1, t12_59_59);
    expect(check12.allowed).toBe(false);

    // 2. Email 2 is picked up at 12:59:59 UTC.
    // Pacing delay pushes actual send time to 13:00:01 UTC
    const outcome2_pacing = await processEmailJob({ emailId: "email-2" }, deps);
    expect(outcome2_pacing).toEqual({
      outcome: "rescheduled",
      reason: "pacing",
      nextAttemptAt: t13_00_01,
    });
    // Rate limit must NOT be checked or consumed at 12:59:59 for Email 2
    expect(db.get("email-2")?.status).toBe("scheduled");
    expect(db.get("email-2")?.attempts).toBe(0); // Retry count unchanged!
    expect(sentMails).toHaveLength(1); // No duplicate send yet

    // 3. Email 2 wakes up at 13:00:01 UTC (in the new hour window)
    currentTime = t13_00_01;
    const outcome2_send = await processEmailJob({ emailId: "email-2" }, deps);

    // Rate limiter must evaluate against the 13:00 UTC window and allow the send
    expect(outcome2_send.outcome).toBe("sent");
    expect(sentMails).toHaveLength(2); // Exactly 1 send for email 2, no duplicate send
    expect(db.get("email-2")?.status).toBe("sent");
    expect(db.get("email-2")?.attempts).toBe(1); // Exactly 1 attempt consumed on send

    // Verify correct 13:00 Redis key was used for Email 2
    expect(spyIncr).toHaveBeenCalledWith("email-rate:sender-boundary:2026-01-01T13:00:00.000Z", 1, expect.any(Number));

    // Verify 13:00 quota was consumed exactly once and is now exhausted
    const check13 = await checkAndConsumeHourlyLimitReal(atomics, "sender-boundary", 1, t13_00_01);
    expect(check13.allowed).toBe(false);
  });

  it("reschedules to 14:00 rather than sending when pacing completes at 13:00:01 but 13:00 quota is already exhausted", async () => {
    const atomics = createFakeAtomics();
    const spyIncr = vi.spyOn(atomics, "incrIfUnderLimit");
    const t12_59_59 = new Date("2026-01-01T12:59:59.000Z");
    const t13_00_01 = new Date("2026-01-01T13:00:01.000Z");
    const t14_00_00 = new Date("2026-01-01T14:00:00.000Z");

    // Pre-exhaust 13:00 quota (limit = 1)
    await checkAndConsumeHourlyLimitReal(atomics, "sender-exhausted", 1, t13_00_01);

    const email = makeEmail({ id: "email-exhausted", sender_id: "sender-exhausted", hourly_limit: 1, scheduled_at: t12_59_59 });
    const db = new Map<string, EmailWithSenderLimit>([["email-exhausted", email]]);
    const sentMails: any[] = [];

    // Pre-reserve a pacing slot at 12:59:59 so pacing pushes to 13:00:01
    await atomics.reserveNextSlot("email-pacing:sender-exhausted", "prev-job", t12_59_59.getTime(), 2000, 3600000);

    let currentTime = t12_59_59;
    const deps: EmailWorkerDeps = {
      findEmailById: vi.fn(async (id) => db.get(id) ?? null),
      updateEmailStatus: vi.fn(async (id, status, opts = {}) => {
        const row = db.get(id)!;
        const updated = { ...row, status: status as any, ...opts };
        db.set(id, updated);
        return updated as any;
      }),
      incrementAttempts: vi.fn(async (id) => {
        const row = db.get(id)!;
        const updated = { ...row, attempts: row.attempts + 1 };
        db.set(id, updated);
        return updated as any;
      }),
      rescheduleEmail: vi.fn(async (id, scheduledAt) => {
        const row = db.get(id)!;
        const updated = { ...row, status: "scheduled" as const, scheduled_at: scheduledAt };
        db.set(id, updated);
        return updated as any;
      }),
      sendMail: vi.fn(async (mail) => {
        sentMails.push(mail);
        return { messageId: "msg-fail", previewUrl: false as const };
      }),
      checkAndConsumeHourlyLimit: (senderId, limit, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now),
      reserveSendSlot: (senderId, emailId, minDelay, now) =>
        reserveSendSlotReal(atomics, senderId, emailId, minDelay, now),
      notifyRateLimitReached: vi.fn(async () => ({ sent: false, reason: "no-slack-connection" as const })),
      updateEmailDocumentStatus: vi.fn(async () => {}),
      now: () => currentTime,
    };

    // Step 1: At 12:59:59, job is rescheduled for pacing to 13:00:01
    const outcome1 = await processEmailJob({ emailId: "email-exhausted" }, deps);
    expect(outcome1).toEqual({
      outcome: "rescheduled",
      reason: "pacing",
      nextAttemptAt: t13_00_01,
    });
    expect(sentMails).toHaveLength(0);
    expect(db.get("email-exhausted")?.attempts).toBe(0);

    // Step 2: At 13:00:01, job wakes up, evaluates 13:00 quota (exhausted), reschedules to 14:00
    currentTime = t13_00_01;
    const outcome2 = await processEmailJob({ emailId: "email-exhausted" }, deps);

    expect(outcome2).toEqual({
      outcome: "rescheduled",
      reason: "rate-limit",
      nextAttemptAt: t14_00_00,
    });
    expect(sentMails).toHaveLength(0); // No send!
    expect(db.get("email-exhausted")?.status).toBe("scheduled");
    expect(db.get("email-exhausted")?.attempts).toBe(0); // Retry attempts preserved!
    expect(spyIncr).toHaveBeenCalledWith("email-rate:sender-exhausted:2026-01-01T13:00:00.000Z", 1, expect.any(Number));
    expect(deps.notifyRateLimitReached).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: "sender-exhausted",
        hourWindowKey: "2026-01-01T13:00:00.000Z",
        nextAvailableAt: t14_00_00,
      })
    );
  });

  it("Case A: same-hour send (12:30 -> pacing -> 12:31) uses 12:00 quota", async () => {
    const atomics = createFakeAtomics();
    const spyIncr = vi.spyOn(atomics, "incrIfUnderLimit");
    const t12_30_00 = new Date("2026-01-01T12:30:00.000Z");
    const t12_31_00 = new Date("2026-01-01T12:31:00.000Z");

    const email = makeEmail({ id: "email-caseA", sender_id: "sender-caseA", hourly_limit: 5, scheduled_at: t12_30_00 });
    const db = new Map<string, EmailWithSenderLimit>([["email-caseA", email]]);

    // Pre-reserve a pacing slot at 12:30:00 pushing nextAllowed to 12:31:00
    await atomics.reserveNextSlot("email-pacing:sender-caseA", "prev", t12_30_00.getTime(), 60000, 3600000);

    let currentTime = t12_30_00;
    const deps = makeDeps(email, {
      findEmailById: vi.fn(async () => db.get("email-caseA") ?? null),
      checkAndConsumeHourlyLimit: (senderId, limit, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now),
      reserveSendSlot: (senderId, emailId, minDelay, now) =>
        reserveSendSlotReal(atomics, senderId, emailId, minDelay, now),
      now: () => currentTime,
    }).deps;

    // Picked up at 12:30:00 -> pacing delays to 12:31:00
    const out1 = await processEmailJob({ emailId: "email-caseA" }, deps);
    expect(out1.outcome).toBe("rescheduled");

    // Wakes at 12:31:00 -> sends under 12:00 quota
    currentTime = t12_31_00;
    const out2 = await processEmailJob({ emailId: "email-caseA" }, deps);
    expect(out2.outcome).toBe("sent");
    expect(spyIncr).toHaveBeenCalledWith("email-rate:sender-caseA:2026-01-01T12:00:00.000Z", 5, expect.any(Number));
  });

  it("Case B: cross-hour send (12:59 -> pacing -> 13:00) uses 13:00 quota", async () => {
    const atomics = createFakeAtomics();
    const spyIncr = vi.spyOn(atomics, "incrIfUnderLimit");
    const t12_59_30 = new Date("2026-01-01T12:59:30.000Z");
    const t13_00_30 = new Date("2026-01-01T13:00:30.000Z");

    const email = makeEmail({ id: "email-caseB", sender_id: "sender-caseB", hourly_limit: 5, scheduled_at: t12_59_30 });
    const db = new Map<string, EmailWithSenderLimit>([["email-caseB", email]]);

    // Pre-reserve pushing next slot across hour to 13:00:30
    await atomics.reserveNextSlot("email-pacing:sender-caseB", "prev", t12_59_30.getTime(), 60000, 3600000);

    let currentTime = t12_59_30;
    const deps = makeDeps(email, {
      findEmailById: vi.fn(async () => db.get("email-caseB") ?? null),
      checkAndConsumeHourlyLimit: (senderId, limit, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now),
      reserveSendSlot: (senderId, emailId, minDelay, now) =>
        reserveSendSlotReal(atomics, senderId, emailId, minDelay, now),
      now: () => currentTime,
    }).deps;

    // 12:59:30 -> pacing delays to 13:00:30
    const out1 = await processEmailJob({ emailId: "email-caseB" }, deps);
    expect(out1.outcome).toBe("rescheduled");

    // 13:00:30 -> sends under 13:00 quota
    currentTime = t13_00_30;
    const out2 = await processEmailJob({ emailId: "email-caseB" }, deps);
    expect(out2.outcome).toBe("sent");
    expect(spyIncr).toHaveBeenCalledWith("email-rate:sender-caseB:2026-01-01T13:00:00.000Z", 5, expect.any(Number));
  });

  it("Case C & D: new hour allows immediate send when quota available, reschedules to next hour when exhausted", async () => {
    const atomics = createFakeAtomics();
    const t13_00_00 = new Date("2026-01-01T13:00:00.000Z");
    const t14_00_00 = new Date("2026-01-01T14:00:00.000Z");

    const email1 = makeEmail({ id: "email-c1", sender_id: "sender-cd", hourly_limit: 1, scheduled_at: t13_00_00 });
    const email2 = makeEmail({ id: "email-c2", sender_id: "sender-cd", hourly_limit: 1, scheduled_at: t13_00_00 });
    const db = new Map<string, EmailWithSenderLimit>([
      ["email-c1", email1],
      ["email-c2", email2],
    ]);

    const deps = makeDeps(email1, {
      findEmailById: vi.fn(async (id) => db.get(id) ?? null),
      checkAndConsumeHourlyLimit: (senderId, limit, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, limit, now),
      reserveSendSlot: vi.fn(async (_s, _e, _d, now) => ({ nextAllowedAt: now })),
      now: () => t13_00_00,
    }).deps;

    // Case C: First job at 13:00:00 finds available quota and sends immediately
    const out1 = await processEmailJob({ emailId: "email-c1" }, deps);
    expect(out1.outcome).toBe("sent");

    // Case D: Second job at 13:00:00 finds 13:00 quota exhausted and reschedules to 14:00:00
    const out2 = await processEmailJob({ emailId: "email-c2" }, deps);
    expect(out2).toEqual({
      outcome: "rescheduled",
      reason: "rate-limit",
      nextAttemptAt: t14_00_00,
    });
  });

  it("Case E: atomic Redis rate limiting prevents exceeding limit across concurrent workers at hour boundary", async () => {
    const atomics = createFakeAtomics();
    const t13_00_00 = new Date("2026-01-01T13:00:00.000Z");
    const limit = 3;
    const workerCount = 10;

    const emails = Array.from({ length: workerCount }, (_, i) =>
      makeEmail({ id: `email-race-${i}`, sender_id: "sender-race", hourly_limit: limit, scheduled_at: t13_00_00 })
    );
    const db = new Map<string, EmailWithSenderLimit>(emails.map((e) => [e.id, e]));

    const createWorkerDeps = (): EmailWorkerDeps => ({
      findEmailById: vi.fn(async (id) => db.get(id) ?? null),
      updateEmailStatus: vi.fn(async (id, status, opts = {}) => {
        const row = db.get(id)!;
        const updated = { ...row, status: status as any, ...opts };
        db.set(id, updated);
        return updated as any;
      }),
      incrementAttempts: vi.fn(async (id) => {
        const row = db.get(id)!;
        const updated = { ...row, attempts: row.attempts + 1 };
        db.set(id, updated);
        return updated as any;
      }),
      rescheduleEmail: vi.fn(async (id, scheduledAt) => {
        const row = db.get(id)!;
        const updated = { ...row, status: "scheduled" as const, scheduled_at: scheduledAt };
        db.set(id, updated);
        return updated as any;
      }),
      sendMail: vi.fn(async () => ({ messageId: `msg-${Date.now()}`, previewUrl: false as const })),
      checkAndConsumeHourlyLimit: (senderId, lim, now) =>
        checkAndConsumeHourlyLimitReal(atomics, senderId, lim, now),
      reserveSendSlot: vi.fn(async (_s, _e, _d, now) => ({ nextAllowedAt: now })),
      notifyRateLimitReached: vi.fn(async () => ({ sent: false, reason: "no-slack-connection" as const })),
      updateEmailDocumentStatus: vi.fn(async () => {}),
      now: () => t13_00_00,
    });

    const outcomes = await Promise.all(
      emails.map((e) => processEmailJob({ emailId: e.id }, createWorkerDeps()))
    );

    const sent = outcomes.filter((o) => o.outcome === "sent");
    const rescheduled = outcomes.filter((o) => o.outcome === "rescheduled" && o.reason === "rate-limit");

    expect(sent).toHaveLength(limit); // Exactly 3 allowed
    expect(rescheduled).toHaveLength(workerCount - limit); // Exactly 7 rescheduled
  });

  it("preserves BullMQ attempts and moves job to delayed via DelayedError when rescheduled", async () => {
    const email = makeEmail({ id: "email-delayed", sender_id: "sender-1", hourly_limit: 1 });
    const targetTime = new Date("2026-01-01T14:00:00.000Z");

    const deps = makeDeps(email, {
      checkAndConsumeHourlyLimit: vi.fn(async () => ({
        allowed: false,
        senderId: "sender-1",
        limit: 1,
        hourWindowStart: new Date(),
        hourWindowKey: "2026-01-01T13:00:00.000Z",
        nextHourStart: targetTime,
      })),
    }).deps;

    const mockJob = {
      id: "job-delayed-1",
      data: { emailId: "email-delayed" },
      moveToDelayed: vi.fn(async () => {}),
    };

    await expect(executeEmailJob(mockJob, "token-xyz", deps)).rejects.toBeInstanceOf(DelayedError);

    expect(mockJob.moveToDelayed).toHaveBeenCalledWith(targetTime.getTime(), "token-xyz");
    // Database attempts was never incremented
    expect(deps.incrementAttempts).not.toHaveBeenCalled();
  });
});
