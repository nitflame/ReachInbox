import type { RedisAtomics } from "./redisAtomics";
import { findSlackConnectionByUserId } from "../models/slack.model";
import { findSenderById } from "../models/sender.model";
import { sendSlackMessage } from "./slackOAuth.service";

/** Same TTL family as the rate-limit counter itself - one notification per sender per hour. */
const NOTIFICATION_KEY_TTL_SECONDS = 3_700;

export interface RateLimitReachedEvent {
  senderId: string;
  senderEmail: string;
  limit: number;
  hourWindowKey: string;
  nextAvailableAt: Date;
}

export type NotifyOutcome =
  | { sent: true }
  | { sent: false; reason: "already-notified" | "no-slack-connection" };

export interface SlackNotifierDeps {
  atomics: RedisAtomics;
  slackWebhookUrl?: string;
  findSlackConnectionByUserId?: typeof findSlackConnectionByUserId;
  findSenderById?: typeof findSenderById;
  sendSlackMessage?: typeof sendSlackMessage;
}

/**
 * Rate-limit notification hook.
 *
 * Idempotency: uses `slack-rate-limit-notified:{senderId}:{hourWindow}` as
 * an atomic Redis "claim" (SET NX) so exactly one notification is attempted
 * per sender per hour, no matter how many worker processes hit the limit
 * for that sender in that window.
 *
 * Safe with no Slack connection configured: it claims the notification slot
 * and logs instead of throwing, ensuring job rescheduling is NEVER broken.
 */
export async function notifyRateLimitReached(
  event: RateLimitReachedEvent,
  deps: SlackNotifierDeps
): Promise<NotifyOutcome> {
  try {
    const key = `slack-rate-limit-notified:${event.senderId}:${event.hourWindowKey}`;
    const claimed = await deps.atomics.claimOnce(key, NOTIFICATION_KEY_TTL_SECONDS);

    if (!claimed) {
      return { sent: false, reason: "already-notified" };
    }

    const findSender = deps.findSenderById ?? findSenderById;
    const findSlack = deps.findSlackConnectionByUserId ?? findSlackConnectionByUserId;
    const sendMessage = deps.sendSlackMessage ?? sendSlackMessage;

    // Look up sender's owning user
    const sender = await findSender(event.senderId).catch(() => null);
    const slackConn = sender ? await findSlack(sender.user_id).catch(() => null) : null;

    const webhookUrl = slackConn?.webhook_url || deps.slackWebhookUrl || null;
    const accessToken = slackConn?.access_token;
    const channelId = slackConn?.channel_id;

    if (!webhookUrl && (!accessToken || !channelId)) {
      console.log(
        `ℹ️  [slack-notifier] sender ${event.senderEmail} hit its hourly limit (${event.limit}/hr); ` +
          `next window starts ${event.nextAvailableAt.toISOString()}. ` +
          "No Slack connection or webhook configured for this user - notification skipped."
      );
      return { sent: false, reason: "no-slack-connection" };
    }

    const message =
      `⚠️ *Rate Limit Warning*: Sender \`${event.senderEmail}\` reached its hourly limit of ${event.limit} emails/hr. ` +
      `Next window starts at ${event.nextAvailableAt.toISOString()}. Emails are automatically rescheduled.`;

    const success = await sendMessage({
      webhookUrl,
      accessToken,
      channelId,
      text: message,
    }).catch((err) => {
      console.warn("⚠️ Slack notification send error:", err instanceof Error ? err.message : err);
      return false;
    });

    if (success) {
      console.log(`✅ [slack-notifier] Notification sent for sender ${event.senderEmail}`);
      return { sent: true };
    }

    return { sent: false, reason: "no-slack-connection" };
  } catch (err) {
    console.warn("⚠️ Error in notifyRateLimitReached hook:", err instanceof Error ? err.message : err);
    return { sent: false, reason: "no-slack-connection" };
  }
}
