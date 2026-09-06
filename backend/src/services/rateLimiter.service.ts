import type { RedisAtomics } from "./redisAtomics";
import { floorToHour, hourWindowKey as computeHourWindowKey, nextHourStart as computeNextHourStart } from "./hourWindow";

/** Give the counter a little longer than an hour to live so a slow clock/tick never truncates the window early. */
const RATE_LIMIT_KEY_TTL_SECONDS = 3_700;

export interface RateLimitDecision {
  allowed: boolean;
  senderId: string;
  limit: number;
  hourWindowStart: Date;
  hourWindowKey: string;
  /** When the sender gets a fresh quota - the reschedule target if `allowed` is false. */
  nextHourStart: Date;
}

/**
 * Atomically checks and (if allowed) consumes one slot of `senderId`'s
 * hourly send quota, keyed as `email-rate:{senderId}:{hourWindow}` so every
 * hour gets an independent counter that naturally expires. Safe to call
 * concurrently from any number of worker processes - see redisAtomics.ts.
 */
export async function checkAndConsumeHourlyLimit(
  atomics: RedisAtomics,
  senderId: string,
  limit: number,
  now: Date
): Promise<RateLimitDecision> {
  const hourWindowStart = floorToHour(now);
  const hourWindowKey = computeHourWindowKey(now);
  const key = `email-rate:${senderId}:${hourWindowKey}`;

  const count = await atomics.incrIfUnderLimit(key, limit, RATE_LIMIT_KEY_TTL_SECONDS);

  return {
    allowed: count !== -1,
    senderId,
    limit,
    hourWindowStart,
    hourWindowKey,
    nextHourStart: computeNextHourStart(now),
  };
}
