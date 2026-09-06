import type { RedisAtomics } from "../redisAtomics";

/**
 * An honest, single-process stand-in for redisAtomics.ts's real Lua-backed
 * implementation. Each method mutates its in-memory state synchronously
 * (no `await` between reading and writing), which is what actually makes a
 * single Lua script atomic on real Redis - Redis executes it start-to-finish
 * without interleaving other clients' commands. This fake reproduces that
 * same "no interleaving" property for any number of concurrent JS callers
 * within one process, so tests that fire many calls via `Promise.all` can
 * validate the *algorithm's* race-freedom.
 *
 * It does NOT prove anything about real Redis/Lua execution - that
 * guarantee comes from Redis itself. This is a stand-in for the contract,
 * not a substitute for it.
 */
export function createFakeAtomics(): RedisAtomics {
  const counters = new Map<string, number>();
  const senderSlots = new Map<string, number>();
  const jobSlots = new Map<string, number>();
  const claims = new Set<string>();

  return {
    async incrIfUnderLimit(key, limit) {
      const current = counters.get(key) ?? 0;
      const next = current + 1;
      if (next > limit) {
        return -1; // rolled back, mirrors the Lua script's DECR-then-return
      }
      counters.set(key, next);
      return next;
    },
    async reserveNextSlot(senderKey, jobKey, nowMs, minDelayMs) {
      const jobReserved = jobSlots.get(jobKey);

      if (jobReserved !== undefined) {
        const lastSlot = senderSlots.get(senderKey) ?? 0;

        if (jobReserved >= nowMs) {
          return jobReserved;
        }

        if (lastSlot <= jobReserved || nowMs >= lastSlot + minDelayMs) {
          if (nowMs > lastSlot) {
            senderSlots.set(senderKey, nowMs);
          }
          return nowMs;
        }
      }

      const lastSlot = senderSlots.get(senderKey) ?? 0;
      const nextAllowed = Math.max(nowMs, lastSlot + minDelayMs);
      senderSlots.set(senderKey, nextAllowed);
      jobSlots.set(jobKey, nextAllowed);
      return nextAllowed;
    },
    async claimOnce(key) {
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    },
  };
}
