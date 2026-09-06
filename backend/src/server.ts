import { createApp } from "./app";
import { env } from "./config/env";
import { checkDbConnection, closeDb } from "./config/db";
import { checkRedisConnection, closeRedis } from "./config/redis";
import { checkQueueConnection, closeEmailQueue } from "./queues/email.queue";

import { ensureEmailIndex } from "./services/elasticsearch.service";

async function bootstrap(): Promise<void> {
  const dbOk = await checkDbConnection();
  if (!dbOk) {
    console.error("⚠️ PostgreSQL is offline. Is it running and DATABASE_URL correct?");
    if (env.NODE_ENV === "production") {
      process.exit(1);
    }
  } else {
    console.log("✅ PostgreSQL connected");
  }

  const redisOk = await checkRedisConnection();
  if (!redisOk) {
    console.error("⚠️ Redis is offline. Is it running and REDIS_URL correct?");
    if (env.NODE_ENV === "production") {
      process.exit(1);
    }
  } else {
    console.log("✅ Redis connected");
  }

  const queueOk = redisOk ? await checkQueueConnection() : false;
  if (!queueOk) {
    console.warn("⚠️ Email queue is running in degraded mode.");
    if (env.NODE_ENV === "production") {
      process.exit(1);
    }
  } else {
    console.log(`✅ BullMQ queue "${env.EMAIL_QUEUE_NAME}" ready`);
  }

  if (redisOk) {
    await ensureEmailIndex().catch(() => {});
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Server listening on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`   Health check: http://localhost:${env.PORT}/health`);
  });

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
