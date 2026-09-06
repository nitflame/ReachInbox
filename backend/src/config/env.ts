import "dotenv/config";
import { z } from "zod";

/**
 * Central, validated environment configuration.
 * Fail fast on boot if required vars are missing/invalid, instead of
 * discovering it later inside a route handler or worker.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // PostgreSQL
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PG_SSL: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Ethereal SMTP. Left optional: if SMTP_USER/SMTP_PASS are unset in a
  // non-production environment, the mailer auto-provisions a throwaway
  // Ethereal test account on worker startup so local dev works out of the box.
  SMTP_HOST: z.string().default("smtp.ethereal.email"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("ReachInbox <no-reply@reachinbox.dev>"),

  // BullMQ
  EMAIL_QUEUE_NAME: z.string().default("email-send-queue"),

  // Worker
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),

  // Scheduling defaults (overridable per-request in the API body)
  DEFAULT_SEND_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  DEFAULT_HOURLY_LIMIT: z.coerce.number().int().positive().default(100),

  // Temporary dev-auth stand-in for real Google OAuth fallback testing
  ENABLE_DEV_AUTH: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  DEV_DEFAULT_USER_EMAIL: z.string().email().default("dev@reachinbox.local"),

  // Slack OAuth (B6)
  SLACK_CLIENT_ID: z.string().default("dummy-slack-client-id"),
  SLACK_CLIENT_SECRET: z.string().default("dummy-slack-client-secret"),
  SLACK_CALLBACK_URL: z.string().default("http://localhost:4000/api/slack/callback"),
  SLACK_WEBHOOK_URL: z.string().optional(),

  // Elasticsearch
  ELASTICSEARCH_URL: z.string().default("http://localhost:9200"),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().default("dummy-google-client-id.apps.googleusercontent.com"),
  GOOGLE_CLIENT_SECRET: z.string().default("dummy-google-client-secret"),
  GOOGLE_CALLBACK_URL: z.string().default("http://localhost:4000/api/auth/google/callback"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  // Session
  SESSION_SECRET: z.string().default("reachinbox-dev-secret-do-not-use-in-production"),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === "production") {
    if (!data.SESSION_SECRET || data.SESSION_SECRET === "reachinbox-dev-secret-do-not-use-in-production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be explicitly configured in production and cannot be the default fallback secret",
      });
    }
    if (!data.ENABLE_DEV_AUTH) {
      if (!data.GOOGLE_CLIENT_ID || data.GOOGLE_CLIENT_ID === "dummy-google-client-id.apps.googleusercontent.com") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GOOGLE_CLIENT_ID"],
          message: "GOOGLE_CLIENT_ID must be explicitly configured in production (or ENABLE_DEV_AUTH=true for demo)",
        });
      }
      if (!data.GOOGLE_CLIENT_SECRET || data.GOOGLE_CLIENT_SECRET === "dummy-google-client-secret") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GOOGLE_CLIENT_SECRET"],
          message: "GOOGLE_CLIENT_SECRET must be explicitly configured in production (or ENABLE_DEV_AUTH=true for demo)",
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Pure parse function, exported separately from the process-wide singleton
 * below so it can be unit-tested with arbitrary env objects without relying
 * on module-caching tricks.
 */
export function buildEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `   - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

function loadEnv(): Env {
  try {
    return buildEnv(process.env);
  } catch (err) {
    console.error("❌", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

export const env = loadEnv();
