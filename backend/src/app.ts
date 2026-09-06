import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { healthRouter } from "./routes/health.routes";
import { emailsRouter } from "./routes/emails.routes";
import { authRouter } from "./routes/auth.routes";
import { slackRouter } from "./routes/slack.routes";
import { devAuthMiddleware } from "./middleware/devAuth.middleware";
import { sessionMiddleware, requireAuth } from "./middleware/auth.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { setupBullBoard } from "./config/bullBoard";

export function createApp(): Express {
  const app = express();

  // Helmet content security policy adjusted for Bull Board UI assets
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  const allowedOrigins = [
    env.FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else if (env.NODE_ENV !== "production") {
          callback(null, origin);
        } else {
          callback(new Error("CORS not allowed"));
        }
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.use(sessionMiddleware);

  app.use(healthRouter);
  app.use("/api/auth", devAuthMiddleware, authRouter);
  app.use("/api/slack", devAuthMiddleware, slackRouter);

  // Bull Board queue dashboard protected with auth middleware
  app.use("/admin/queues", devAuthMiddleware, requireAuth, setupBullBoard());

  // Email API endpoints protected with auth middleware
  app.use("/api/emails", devAuthMiddleware, requireAuth, emailsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
