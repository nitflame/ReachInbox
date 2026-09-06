-- 002_users_senders_scheduling.sql
-- Adds tenant ownership (users), multi-sender support (senders), and
-- scopes idempotency per-tenant instead of globally.

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(320) NOT NULL UNIQUE,
  name        VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- A user/tenant can send from multiple "From" addresses.
CREATE TABLE IF NOT EXISTS senders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email         VARCHAR(320) NOT NULL,
  display_name  VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_senders_user_id ON senders (user_id);

-- Milestone 1 shipped before tenant ownership existed and carried no real
-- traffic (schema-only verification). Clearing it out lets us add the new
-- NOT NULL foreign keys below cleanly instead of doing a multi-step
-- nullable-then-backfill-then-NOT-NULL dance for rows nothing depends on.
TRUNCATE TABLE emails;

ALTER TABLE emails
  ADD COLUMN user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN sender_id UUID NOT NULL REFERENCES senders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails (user_id);
CREATE INDEX IF NOT EXISTS idx_emails_sender_id ON emails (sender_id);
-- Powers "list this tenant's emails by status" and the worker/API status checks.
CREATE INDEX IF NOT EXISTS idx_emails_user_status ON emails (user_id, status);

-- Idempotency keys only need to be unique per tenant, not across all tenants.
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_idempotency_key_key;
ALTER TABLE emails
  ADD CONSTRAINT emails_user_idempotency_key_unique UNIQUE (user_id, idempotency_key);
