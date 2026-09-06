CREATE TABLE IF NOT EXISTS slack_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255),
  channel_id VARCHAR(255),
  channel_name VARCHAR(255),
  webhook_url TEXT,
  access_token TEXT NOT NULL,
  bot_user_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT slack_connections_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_connections_user_id ON slack_connections (user_id);
