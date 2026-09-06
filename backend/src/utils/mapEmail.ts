import type { EmailRecord } from "../types/email";

/**
 * camelCase API shape, decoupled from the snake_case DB row shape so the
 * schema can evolve without automatically changing the wire format.
 */
export function toApiEmail(email: EmailRecord) {
  return {
    id: email.id,
    sender: email.sender,
    recipient: email.recipient,
    subject: email.subject,
    status: email.status,
    scheduledAt: email.scheduled_at,
    sentAt: email.sent_at,
    bullmqJobId: email.bullmq_job_id,
    attempts: email.attempts,
    lastError: email.last_error,
    createdAt: email.created_at,
    updatedAt: email.updated_at,
  };
}
