import type { RedisAtomics } from "./redisAtomics";

export interface SendSlot {
  /** The earliest epoch-ms timestamp this sender's next email may actually send. */
  nextAllowedAt: Date;
}

/**
 * Atomically reserves the next send slot for `senderId`, enforcing at least
 * `minDelayMs` between any two sends for that sender - regardless of how
 * many worker processes or how much concurrency is calling this at once.
 * Keyed as `email-pacing:{senderId}`.
 *
 * If minDelayMs <= 0, pacing is effectively disabled and "now" is always
 * returned immediately (still goes through the atomic reservation so the
 * key stays consistent, but never forces a wait).
 */
export async function reserveSendSlot(
  atomics: RedisAtomics,
  senderId: string,
  emailId: string,
  minDelayMs: number,
  now: Date
): Promise<SendSlot> {
  if (minDelayMs <= 0) {
    return { nextAllowedAt: now };
  }

  const senderKey = `email-pacing:${senderId}`;
  const jobKey = `email-pacing:job:${emailId}`;
  const ttlMs = minDelayMs + 3_600_000; // cleanup TTL
  const nextAllowedMs = await atomics.reserveNextSlot(senderKey, jobKey, now.getTime(), minDelayMs, ttlMs);

  return { nextAllowedAt: new Date(nextAllowedMs) };
}
