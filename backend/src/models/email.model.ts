import { query } from "../config/db";
import type { CreateEmailInput, EmailRecord, EmailStatus, EmailWithSenderLimit } from "../types/email";

/**
 * Data-access layer for the `emails` table.
 * Kept as plain functions (no ORM) to stay lightweight.
 */

/**
 * Insert a new email row unless one already exists for this
 * (user_id, idempotency_key) pair, in which case the existing row is
 * returned instead. This is the DB-level half of the idempotency
 * mechanism - see services/emailScheduler.service.ts for the full flow,
 * including recovery when a prior request persisted the row but crashed
 * before enqueueing the BullMQ job.
 */
export async function createEmailIfNotExists(
  input: CreateEmailInput
): Promise<{ email: EmailRecord; created: boolean }> {
  const inserted = await query<EmailRecord>(
    `INSERT INTO emails
       (user_id, sender_id, sender, recipient, subject, body, status, scheduled_at, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      input.userId,
      input.senderId,
      input.sender,
      input.recipient,
      input.subject,
      input.body,
      input.scheduledAt,
      input.idempotencyKey,
    ]
  );

  if (inserted.rows[0]) {
    return { email: inserted.rows[0], created: true };
  }

  // Conflict: a row for this (user, idempotency_key) already exists. Fetch it.
  const existing = await query<EmailRecord>(
    `SELECT * FROM emails WHERE user_id = $1 AND idempotency_key = $2`,
    [input.userId, input.idempotencyKey]
  );

  if (!existing.rows[0]) {
    // Extremely unlikely (row deleted between the INSERT and this SELECT),
    // but fail loudly rather than silently returning undefined.
    throw new Error(
      `Idempotent conflict on insert but no existing row found for idempotency_key=${input.idempotencyKey}`
    );
  }

  return { email: existing.rows[0], created: false };
}

export async function findEmailById(id: string): Promise<EmailRecord | null> {
  const result = await query<EmailRecord>(`SELECT * FROM emails WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

/**
 * Same as `findEmailById`, plus the owning sender's current `hourly_limit`
 * policy - used by the worker so the rate limiter never needs a second
 * round trip. Kept as a separate function (rather than always joining) so
 * the plain `emails` shape stays the API's contract.
 */
export async function findEmailWithSenderLimitById(id: string): Promise<EmailWithSenderLimit | null> {
  const result = await query<EmailWithSenderLimit>(
    `SELECT emails.*, senders.hourly_limit
     FROM emails
     JOIN senders ON senders.id = emails.sender_id
     WHERE emails.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findEmailByIdForUser(
  id: string,
  userId: string
): Promise<EmailRecord | null> {
  const result = await query<EmailRecord>(
    `SELECT * FROM emails WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] ?? null;
}

export async function attachBullmqJobId(
  id: string,
  bullmqJobId: string
): Promise<EmailRecord> {
  const result = await query<EmailRecord>(
    `UPDATE emails
     SET status = CASE WHEN status = 'scheduled' THEN 'queued' ELSE status END,
         bullmq_job_id = $2
     WHERE id = $1
     RETURNING *`,
    [id, bullmqJobId]
  );
  return result.rows[0];
}

export async function updateEmailStatus(
  id: string,
  status: EmailStatus,
  opts: { sentAt?: Date; lastError?: string | null } = {}
): Promise<EmailRecord> {
  const result = await query<EmailRecord>(
    `UPDATE emails
     SET status = $2,
         sent_at = COALESCE($3, sent_at),
         last_error = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE last_error END
     WHERE id = $1
     RETURNING *`,
    [id, status, opts.sentAt ?? null, opts.lastError ?? null]
  );
  return result.rows[0];
}

export async function incrementAttempts(id: string): Promise<EmailRecord> {
  const result = await query<EmailRecord>(
    `UPDATE emails SET attempts = attempts + 1 WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

/**
 * Moves an email's target send time forward without touching `attempts`,
 * `bullmq_job_id`, or creating any new row. Used when the worker defers a
 * job for a reason that is NOT a send failure (hourly rate limit reached,
 * or the per-sender minimum-delay pacing gate hasn't opened yet) - see
 * workers/email.worker.ts. The BullMQ job itself is moved to a delayed
 * state by the caller; this just keeps the DB's story consistent with it.
 */
export async function rescheduleEmail(id: string, scheduledAt: Date): Promise<EmailRecord> {
  const result = await query<EmailRecord>(
    `UPDATE emails SET status = 'scheduled', scheduled_at = $2 WHERE id = $1 RETURNING *`,
    [id, scheduledAt]
  );
  return result.rows[0];
}
