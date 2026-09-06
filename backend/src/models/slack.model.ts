import { query } from "../config/db";

export interface SlackConnectionRecord {
  id: string;
  user_id: string;
  team_id: string;
  team_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  webhook_url: string | null;
  access_token: string;
  bot_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertSlackConnectionInput {
  userId: string;
  teamId: string;
  teamName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  webhookUrl?: string | null;
  accessToken: string;
  botUserId?: string | null;
}

export async function findSlackConnectionByUserId(
  userId: string
): Promise<SlackConnectionRecord | null> {
  const result = await query<SlackConnectionRecord>(
    `SELECT * FROM slack_connections WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function upsertSlackConnection(
  input: UpsertSlackConnectionInput
): Promise<SlackConnectionRecord> {
  const result = await query<SlackConnectionRecord>(
    `INSERT INTO slack_connections
       (user_id, team_id, team_name, channel_id, channel_name, webhook_url, access_token, bot_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       team_id = EXCLUDED.team_id,
       team_name = EXCLUDED.team_name,
       channel_id = EXCLUDED.channel_id,
       channel_name = EXCLUDED.channel_name,
       webhook_url = EXCLUDED.webhook_url,
       access_token = EXCLUDED.access_token,
       bot_user_id = EXCLUDED.bot_user_id,
       updated_at = NOW()
     RETURNING *`,
    [
      input.userId,
      input.teamId,
      input.teamName ?? null,
      input.channelId ?? null,
      input.channelName ?? null,
      input.webhookUrl ?? null,
      input.accessToken,
      input.botUserId ?? null,
    ]
  );

  return result.rows[0];
}

export async function deleteSlackConnectionByUserId(userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM slack_connections WHERE user_id = $1 RETURNING id`,
    [userId]
  );
  return (result.rowCount ?? 0) > 0;
}
