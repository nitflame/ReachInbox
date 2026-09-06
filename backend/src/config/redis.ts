import IORedis, { type Redis } from "ioredis";
import { env } from "./env";

/**
 * Single shared Redis connection.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ for blocking
 * connections (Workers/QueueEvents) - without it BullMQ throws at runtime.
 * It's safe to reuse the same settings for the general-purpose connection
 * used by the Queue producer in this milestone.
 */
export const redis: Redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 1000, 10000),
  ...(env.REDIS_URL.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {}),
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err.message);
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (err) {
    console.error("❌ Redis connection check failed:", err);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
