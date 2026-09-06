import { createHash } from "crypto";

/**
 * Derives a deterministic, bounded-length per-email idempotency key from a
 * batch-level key (client-supplied `Idempotency-Key` header/body field) and
 * a recipient address.
 *
 * Deterministic: the same (batchKey, recipient) pair always produces the
 * same key, so replaying an identical /api/emails/schedule request (same
 * batch key) maps each recipient back onto the same `emails` row instead of
 * creating a duplicate - see emails_user_idempotency_key_unique.
 */
export function deriveEmailIdempotencyKey(batchKey: string, recipient: string): string {
  const normalizedRecipient = recipient.trim().toLowerCase();
  return createHash("sha256").update(`${batchKey}::${normalizedRecipient}`).digest("hex");
}
