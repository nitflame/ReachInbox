import { z } from "zod";

export const scheduleEmailsSchema = z
  .object({
    sender: z.string().trim().email("sender must be a valid email address"),

    recipient: z.string().trim().email("recipient must be a valid email address").optional(),
    recipients: z
      .array(z.string().trim().email("each recipient must be a valid email address"))
      .min(1)
      .optional(),

    subject: z.string().trim().min(1, "subject is required").max(998),
    body: z.string().min(1, "body is required"),

    // ISO 8601 datetime. Omitted -> "now".
    startTime: z.string().datetime({ offset: true }).optional(),

    delayBetweenEmailsMs: z.coerce.number().int().min(0).optional(),
    hourlyLimit: z.coerce.number().int().positive().optional(),

    idempotencyKey: z.string().trim().min(1).max(255).optional(),
  })
  .refine((data) => Boolean(data.recipient) || Boolean(data.recipients?.length), {
    message: "Provide either `recipient` or a non-empty `recipients` array",
    path: ["recipients"],
  });

export type ScheduleEmailsBody = z.infer<typeof scheduleEmailsSchema>;
