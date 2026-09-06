import { Queue } from "bullmq";
import { redis } from "../config/redis";
import { env } from "../config/env";

/**
 * Producer-side queue for outbound emails.
 * The Worker that actually consumes this queue (and talks to Ethereal SMTP)
 * is out of scope for this milestone - this just wires up the queue so
 * jobs can be enqueued and inspected.
 */
export const emailQueue = new Queue(env.EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  },
});

emailQueue.on("error", (err) => {
  console.error("❌ Email queue error:", err.message);
});

export async function checkQueueConnection(): Promise<boolean> {
  try {
    await emailQueue.waitUntilReady();
    return true;
  } catch (err) {
    console.error("❌ Email queue is not ready:", err);
    return false;
  }
}

export async function closeEmailQueue(): Promise<void> {
  await emailQueue.close();
}
