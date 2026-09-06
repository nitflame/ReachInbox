import type { Redis } from "ioredis";

/**
 * Every primitive here runs as a single Lua script, which Redis executes
 * atomically (Redis is single-threaded for command/script execution) - so
 * these are safe to call concurrently from any number of worker processes
 * without any additional locking. No in-memory counters are involved.
 */

/**
 * KEYS[1] = rate-limit counter key
 * ARGV[1] = limit (max allowed count within the window)
 * ARGV[2] = ttl in seconds to expire the key after (cleanup only)
 *
 * Atomically increments the counter and, if that increment pushed it over
 * `limit`, atomically rolls the increment back and reports rejection - all
 * in one round trip, so two callers can never both observe "1 slot left"
 * and both take it.
 */
const INCR_IF_UNDER_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return -1
end
return count
`;

/**
 * KEYS[1] = pacing key per sender (holds epoch-ms timestamp of latest allocated send slot)
 * KEYS[2] = pacing key per job (holds epoch-ms timestamp of reserved slot for this job)
 * ARGV[1] = now (epoch ms)
 * ARGV[2] = minDelayMs (minimum gap enforced between sends for this sender)
 * ARGV[3] = ttl in ms to expire the keys after (cleanup only)
 *
 * Atomically reserves or validates the send slot for a specific job:
 * 1. If job already has a reserved slot:
 *    - If reservedSlot >= now: return reservedSlot (job woke up on time or early for its slot).
 *    - If reservedSlot < now: if no conflicting later slot was reserved (lastSlot <= reservedSlot
 *      or now >= lastSlot + minDelayMs), the reservation is valid and returns `now` (updating sender key).
 *    - If stale (another job took a slot after this job and now < lastSlot + minDelayMs), fall through to allocate a new slot.
 * 2. Otherwise (new job or stale reservation):
 *    - Calculate nextAllowed = max(now, lastSlot + minDelayMs).
 *    - Update sender key and job key to nextAllowed.
 *    - Return nextAllowed.
 */
const RESERVE_NEXT_SLOT_SCRIPT = `
local senderKey = KEYS[1]
local jobKey = KEYS[2]
local now = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[3])

local jobReserved = redis.call('GET', jobKey)

if jobReserved then
  local reservedMs = tonumber(jobReserved)
  local lastSlot = tonumber(redis.call('GET', senderKey) or '0')

  if reservedMs >= now then
    return reservedMs
  end

  if lastSlot <= reservedMs or now >= (lastSlot + minDelay) then
    if now > lastSlot then
      redis.call('SET', senderKey, now, 'PX', ttlMs)
    end
    return now
  end
end

local lastSlot = tonumber(redis.call('GET', senderKey) or '0')
local nextAllowed = lastSlot + minDelay
if nextAllowed < now then
  nextAllowed = now
end

redis.call('SET', senderKey, nextAllowed, 'PX', ttlMs)
redis.call('SET', jobKey, nextAllowed, 'PX', ttlMs)

return nextAllowed
`;

export interface RedisAtomics {
  /** Returns the new count if under `limit`, or -1 if it was rejected (and rolled back). */
  incrIfUnderLimit(key: string, limit: number, ttlSeconds: number): Promise<number>;
  /** Returns the epoch-ms timestamp this caller is allowed to proceed at. */
  reserveNextSlot(
    senderKey: string,
    jobKey: string,
    nowMs: number,
    minDelayMs: number,
    ttlMs: number
  ): Promise<number>;
  /** Returns true only for the first caller for this key (SET NX); false for every later one. */
  claimOnce(key: string, ttlSeconds: number): Promise<boolean>;
}

export function createRedisAtomics(redis: Redis): RedisAtomics {
  return {
    async incrIfUnderLimit(key, limit, ttlSeconds) {
      const result = await redis.eval(INCR_IF_UNDER_LIMIT_SCRIPT, 1, key, limit, ttlSeconds);
      return Number(result);
    },
    async reserveNextSlot(senderKey, jobKey, nowMs, minDelayMs, ttlMs) {
      const result = await redis.eval(RESERVE_NEXT_SLOT_SCRIPT, 2, senderKey, jobKey, nowMs, minDelayMs, ttlMs);
      return Number(result);
    },
    async claimOnce(key, ttlSeconds) {
      const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    },
  };
}
