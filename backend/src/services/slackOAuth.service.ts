import { env } from "../config/env";

export interface SlackTokenResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: {
    id: string;
    name?: string;
  };
  incoming_webhook?: {
    url?: string;
    channel?: string;
    channel_id?: string;
  };
}

export function getSlackAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: "chat:write,incoming-webhook",
    redirect_uri: env.SLACK_CALLBACK_URL,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackCodeForTokens(code: string): Promise<SlackTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    redirect_uri: env.SLACK_CALLBACK_URL,
  });

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Slack token exchange HTTP error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as SlackTokenResponse;
  if (!data.ok) {
    throw new Error(`Slack API error during token exchange: ${data.error || "Unknown error"}`);
  }

  return data;
}

export async function sendSlackMessage(opts: {
  webhookUrl?: string | null;
  accessToken?: string;
  channelId?: string | null;
  text: string;
}): Promise<boolean> {
  if (opts.webhookUrl) {
    const response = await fetch(opts.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: opts.text }),
    });
    return response.ok;
  }

  if (opts.accessToken && opts.channelId) {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify({
        channel: opts.channelId,
        text: opts.text,
      }),
    });
    const result = (await response.json()) as { ok: boolean };
    return result.ok;
  }

  return false;
}
