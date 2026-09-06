import { query } from "../config/db";
import { env } from "../config/env";
import type { SenderRecord } from "../types/email";

/**
 * A tenant can send from multiple "From" addresses; this upserts one on
 * first use so /api/emails/schedule never has to be told about senders
 * ahead of time.
 *
 * `hourlyLimit` is only applied when the sender is first created - it's a
 * per-sender throughput policy enforced later by the worker's rate limiter
 * (see services/rateLimiter.service.ts), not a per-request setting, so a
 * later schedule request supplying a different `hourlyLimit` for the same
 * sender does NOT silently change its established policy. Adjusting an
 * existing sender's limit is a deliberate action left for a future
 * "manage senders" endpoint.
 */
export async function findOrCreateSender(
  userId: string,
  email: string,
  displayName?: string,
  hourlyLimit?: number
): Promise<SenderRecord> {
  const normalized = email.trim().toLowerCase();

  const result = await query<SenderRecord>(
    `INSERT INTO senders (user_id, email, display_name, hourly_limit)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, email)
     DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, senders.display_name)
     RETURNING *`,
    [userId, normalized, displayName ?? null, hourlyLimit ?? env.DEFAULT_HOURLY_LIMIT]
  );

  return result.rows[0];
}

export async function findSenderById(id: string): Promise<SenderRecord | null> {
  const result = await query<SenderRecord>(`SELECT * FROM senders WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}
