import { Router, type Request, type Response } from "express";
import { checkDbConnection } from "../config/db";
import { checkRedisConnection } from "../config/redis";
import { checkQueueConnection } from "../queues/email.queue";

export const healthRouter = Router();

healthRouter.get("/health", async (req: Request, res: Response) => {
  const [dbUp, redisUp, queueUp] = await Promise.all([
    checkDbConnection().catch(() => false),
    checkRedisConnection().catch(() => false),
    checkQueueConnection().catch(() => false),
  ]);

  const allUp = dbUp && redisUp && queueUp;
  const statusCode = req.query.strict === "1" ? (allUp ? 200 : 503) : 200;

  res.status(statusCode).json({
    status: allUp ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    dependencies: {
      postgres: dbUp ? "up" : "down",
      redis: redisUp ? "up" : "down",
      bullmq: queueUp ? "up" : "down",
    },
  });
});
