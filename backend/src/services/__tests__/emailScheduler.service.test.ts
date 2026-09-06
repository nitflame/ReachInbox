import { beforeEach, describe, expect, it } from "vitest";
import { scheduleEmails, type EmailSchedulerDeps } from "../emailScheduler.service";
import { deriveEmailIdempotencyKey } from "../idempotency";
import type { EmailRecord } from "../../types/email";
import type { CreateEmailInput } from "../../types/email";

/**
 * A tiny in-memory stand-in for the `emails` table, faithful enough to the
 * real model functions to exercise the ordering/idempotency logic in
 * emailScheduler.service.ts without a real Postgres connection.
 */
function makeFakeDb() {
  const rows = new Map<string, EmailRecord>(); // key: `${userId}::${idempotencyKey}`
  let nextId = 1;

  const createEmailIfNotExists = async (
    input: CreateEmailInput
  ): Promise<{ email: EmailRecord; created: boolean }> => {
    const key = `${input.userId}::${input.idempotencyKey}`;
    const existing = rows.get(key);
    if (existing) {
      return { email: existing, created: false };
    }

    const email: EmailRecord = {
      id: `email-${nextId++}`,
      user_id: input.userId,
      sender_id: input.senderId,
      idempotency_key: input.idempotencyKey,
      sender: input.sender,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      status: "scheduled",
      scheduled_at: input.scheduledAt,
      sent_at: null,
      bullmq_job_id: null,
      attempts: 0,
      last_error: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    rows.set(key, email);
    return { email, created: true };
  };

  const attachBullmqJobId = async (id: string, bullmqJobId: string): Promise<EmailRecord> => {
    for (const email of rows.values()) {
      if (email.id === id) {
        email.bullmq_job_id = bullmqJobId;
        email.status = "queued";
        return email;
      }
    }
    throw new Error(`email ${id} not found`);
  };

  return { rows, createEmailIfNotExists, attachBullmqJobId };
}

describe("scheduleEmails", () => {
  let db: ReturnType<typeof makeFakeDb>;
  let enqueueCalls: Array<{ emailId: string; delayMs: number }>;
  let callOrder: string[];
  let deps: EmailSchedulerDeps;
  const fixedNow = new Date("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    db = makeFakeDb();
    enqueueCalls = [];
    callOrder = [];

    deps = {
      findOrCreateSender: async (userId, email) => {
        callOrder.push("findOrCreateSender");
        return {
          id: "sender-1",
          user_id: userId,
          email,
          display_name: null,
          hourly_limit: 100,
          created_at: new Date(),
        };
      },
      createEmailIfNotExists: async (input) => {
        callOrder.push("createEmailIfNotExists");
        return db.createEmailIfNotExists(input);
      },
      attachBullmqJobId: async (id, jobId) => {
        callOrder.push("attachBullmqJobId");
        return db.attachBullmqJobId(id, jobId);
      },
      enqueueJob: async (emailId, delayMs) => {
        callOrder.push("enqueueJob");
        enqueueCalls.push({ emailId, delayMs });
        return `job-for-${emailId}`;
      },
      indexEmailDocument: async () => {},
      now: () => fixedNow,
    };
  });

  it("persists the DB row before enqueueing the BullMQ job", async () => {
    await scheduleEmails(
      {
        user: { id: "user-1", email: "u@example.com" },
        sender: "sender@example.com",
        recipient: "to@example.com",
        subject: "Hi",
        body: "Hello",
        idempotencyKey: "batch-1",
      },
      deps
    );

    expect(callOrder).toEqual([
      "findOrCreateSender",
      "createEmailIfNotExists",
      "enqueueJob",
      "attachBullmqJobId",
    ]);
  });

  it("computes the BullMQ delay from scheduled_at relative to now()", async () => {
    const startTime = new Date(fixedNow.getTime() + 60_000).toISOString(); // 1 minute out

    await scheduleEmails(
      {
        user: { id: "user-1", email: "u@example.com" },
        sender: "sender@example.com",
        recipient: "to@example.com",
        subject: "Hi",
        body: "Hello",
        startTime,
        idempotencyKey: "batch-1",
      },
      deps
    );

    expect(enqueueCalls).toHaveLength(1);
    expect(enqueueCalls[0].delayMs).toBe(60_000);
  });

  it("never produces a negative delay for a startTime in the past", async () => {
    const startTime = new Date(fixedNow.getTime() - 60_000).toISOString();

    await scheduleEmails(
      {
        user: { id: "user-1", email: "u@example.com" },
        sender: "sender@example.com",
        recipient: "to@example.com",
        subject: "Hi",
        body: "Hello",
        startTime,
        idempotencyKey: "batch-1",
      },
      deps
    );

    expect(enqueueCalls[0].delayMs).toBe(0);
  });

  it("spaces multiple recipients apart using the effective delay", async () => {
    const result = await scheduleEmails(
      {
        user: { id: "user-1", email: "u@example.com" },
        sender: "sender@example.com",
        recipients: ["a@example.com", "b@example.com", "c@example.com"],
        subject: "Hi",
        body: "Hello",
        delayBetweenEmailsMs: 10_000,
        hourlyLimit: 1000,
        idempotencyKey: "batch-1",
      },
      deps
    );

    expect(result.pacing.effectiveDelayMs).toBe(10_000);
    expect(enqueueCalls.map((c) => c.delayMs)).toEqual([0, 10_000, 20_000]);
  });

  it("is idempotent: replaying the same batch key does not create duplicate rows or jobs", async () => {
    const params = {
      user: { id: "user-1", email: "u@example.com" },
      sender: "sender@example.com",
      recipient: "to@example.com",
      subject: "Hi",
      body: "Hello",
      idempotencyKey: "batch-1",
    };

    const first = await scheduleEmails(params, deps);
    const second = await scheduleEmails(params, deps);

    expect(db.rows.size).toBe(1); // only one row ever created
    expect(enqueueCalls).toHaveLength(1); // enqueueJob only called once
    expect(first.emails[0].id).toBe(second.emails[0].id);
    expect(first.emails[0].idempotentReplay).toBe(false);
    expect(second.emails[0].idempotentReplay).toBe(true);
    expect(second.emails[0].bullmqJobId).toBe(first.emails[0].bullmqJobId);
  });

  it("recovers from the crash window: a persisted row with no job id gets enqueued", async () => {
    // Simulate a prior request that persisted the row but crashed before
    // enqueueing (bullmq_job_id left null).
    const derivedKey = deriveEmailIdempotencyKey("batch-1", "to@example.com");
    db.rows.set(`user-1::${derivedKey}`, {
      id: "email-precreated",
      user_id: "user-1",
      sender_id: "sender-1",
      idempotency_key: derivedKey,
      sender: "sender@example.com",
      recipient: "to@example.com",
      subject: "Hi",
      body: "Hello",
      status: "scheduled",
      scheduled_at: fixedNow,
      sent_at: null,
      bullmq_job_id: null,
      attempts: 0,
      last_error: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await scheduleEmails(
      {
        user: { id: "user-1", email: "u@example.com" },
        sender: "sender@example.com",
        recipient: "to@example.com",
        subject: "Hi",
        body: "Hello",
        idempotencyKey: "batch-1",
      },
      deps
    );

    expect(enqueueCalls).toHaveLength(1);
    expect(result.emails[0].bullmqJobId).toBe("job-for-email-precreated");
  });

  it("never re-enqueues an email that is already sent", async () => {
    const derivedKey = deriveEmailIdempotencyKey("batch-1", "to@example.com");
    db.rows.set(`user-1::${derivedKey}`, {
      id: "email-sent",
      user_id: "user-1",
      sender_id: "sender-1",
      idempotency_key: derivedKey,
      sender: "sender@example.com",
      recipient: "to@example.com",
      subject: "Hi",
      body: "Hello",
      status: "sent",
      scheduled_at: fixedNow,
      sent_at: fixedNow,
      bullmq_job_id: "job-already-sent",
      attempts: 1,
      last_error: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await scheduleEmails(
      {
        user: { id: "user-1", email: "u@example.com" },
        sender: "sender@example.com",
        recipient: "to@example.com",
        subject: "Hi",
        body: "Hello",
        idempotencyKey: "batch-1",
      },
      deps
    );

    expect(enqueueCalls).toHaveLength(0);
    expect(result.emails[0].status).toBe("sent");
    expect(result.emails[0].idempotentReplay).toBe(true);
  });

  it("de-duplicates the same recipient listed twice in one request", async () => {
    const result = await scheduleEmails(
      {
        user: { id: "user-1", email: "u@example.com" },
        sender: "sender@example.com",
        recipients: ["dup@example.com", "DUP@example.com"],
        subject: "Hi",
        body: "Hello",
        idempotencyKey: "batch-1",
      },
      deps
    );

    expect(result.emails).toHaveLength(1);
    expect(enqueueCalls).toHaveLength(1);
  });
});
