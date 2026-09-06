import { Router, type Request, type Response } from "express";
import { checkDbConnection } from "../config/db";
import { checkRedisConnection } from "../config/redis";
import { checkQueueConnection } from "../queues/email.queue";

export const healthRouter = Router();

healthRouter.get("/health", async (_req: Request, res: Response) => {
  const [dbUp, redisUp, queueUp] = await Promise.all([
    checkDbConnection(),
    checkRedisConnection(),
    checkQueueConnection(),
  ]);

  const allUp = dbUp && redisUp && queueUp;

  res.status(allUp ? 200 : 503).json({
    status: allUp ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    dependencies: {
      postgres: dbUp ? "up" : "down",
      redis: redisUp ? "up" : "down",
      bullmq: queueUp ? "up" : "down",
    },
  });
});
