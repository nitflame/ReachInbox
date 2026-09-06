import { createApp } from "./app";
import { env } from "./config/env";
import { checkDbConnection, closeDb } from "./config/db";
import { checkRedisConnection, closeRedis } from "./config/redis";
import { checkQueueConnection, closeEmailQueue } from "./queues/email.queue";

import { ensureEmailIndex } from "./services/elasticsearch.service";
import { runMigrations } from "./db/migrate";

async function bootstrap(): Promise<void> {
  const app = createApp();
  const port = Number(process.env.PORT) || env.PORT || 4000;
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server listening on 0.0.0.0:${port} [${env.NODE_ENV}]`);
    console.log(`   Health check: http://localhost:${port}/health`);
  });

  // Background database & Redis initialization without blocking HTTP liveness checks
  (async () => {
    try {
      let dbOk = false;
      for (let i = 0; i < 5; i++) {
        dbOk = await checkDbConnection();
        if (dbOk) break;
        console.warn(`⏳ Waiting for PostgreSQL to be ready (attempt ${i + 1}/5)...`);
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (dbOk) {
        console.log("✅ PostgreSQL connected");
        await runMigrations().catch((err) => {
          console.warn("⚠️ Migration check warning:", err instanceof Error ? err.message : String(err));
        });
      } else {
        console.error("⚠️ PostgreSQL is offline. Is DATABASE_URL configured?");
      }

      let redisOk = false;
      for (let i = 0; i < 5; i++) {
        redisOk = await checkRedisConnection();
        if (redisOk) break;
        console.warn(`⏳ Waiting for Redis to be ready (attempt ${i + 1}/5)...`);
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (redisOk) {
        console.log("✅ Redis connected");
        const queueOk = await checkQueueConnection();
        if (queueOk) {
          console.log(`✅ BullMQ queue "${env.EMAIL_QUEUE_NAME}" ready`);
        }
        await ensureEmailIndex().catch(() => {});
      } else {
        console.error("⚠️ Redis is offline. Is REDIS_URL configured?");
      }
    } catch (err) {
      console.warn("⚠️ Async bootstrap warning:", err);
    }
  })();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await closeEmailQueue();
        await closeRedis();
        await closeDb();
        console.log("✅ Shutdown complete.");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error during shutdown:", err);
        process.exit(1);
      }
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("❌ Fatal error during bootstrap:", err);
  process.exit(1);
});
