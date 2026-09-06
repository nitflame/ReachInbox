-- 004_user_google_auth.sql
-- Adds Google OAuth identity mapping (google_id) and avatar/profile picture.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar TEXT;

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);
