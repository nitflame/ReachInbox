export type EmailStatus =
  | "pending"
  | "scheduled"
  | "queued"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";

/**
 * Row shape as stored in / returned from PostgreSQL (snake_case columns
 * mapped 1:1, since node-postgres returns rows with the column names as-is).
 */
export interface EmailRecord {
  id: string;
  user_id: string;
  sender_id: string;
  idempotency_key: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: Date | null;
  sent_at: Date | null;
  bullmq_job_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEmailInput {
  userId: string;
  senderId: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  idempotencyKey: string;
}

/** An email row joined with its sender's current hourly rate-limit policy. */
export interface EmailWithSenderLimit extends EmailRecord {
  hourly_limit: number;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  google_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SenderRecord {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  hourly_limit: number;
  created_at: Date;
}
