import { env } from "./config/env";
import { checkDbConnection, closeDb } from "./config/db";
import { checkRedisConnection, closeRedis } from "./config/redis";
import { createEmailWorker } from "./workers/email.worker";

/**
 * Standalone process for the BullMQ worker, run separately from the API
 * server (`npm run worker` / `npm run worker:dev`) - the same shape you'd
 * deploy as its own container/process in production so API latency is
 * never coupled to email-sending throughput.
 */
async function bootstrap(): Promise<void> {
  const dbOk = await checkDbConnection();
  if (!dbOk) {
    console.error("❌ Could not connect to PostgreSQL.");
    process.exit(1);
  }

  const redisOk = await checkRedisConnection();
  if (!redisOk) {
    console.error("❌ Could not connect to Redis.");
    process.exit(1);
  }

  const worker = createEmailWorker();
  console.log(
    `🚀 Email worker started - queue="${env.EMAIL_QUEUE_NAME}" concurrency=${env.WORKER_CONCURRENCY}`
  );

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received. Closing worker gracefully...`);
    try {
      await worker.close();
      await closeRedis();
      await closeDb();
      console.log("✅ Worker shutdown complete.");
      process.exit(0);
    } catch (err) {
      console.error("❌ Error during worker shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("❌ Fatal error during worker bootstrap:", err);
  process.exit(1);
});
