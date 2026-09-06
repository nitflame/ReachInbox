-- 001_init.sql
-- Foundation schema: emails table used for scheduling, sending status,
-- and BullMQ job tracking.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TYPE email_status AS ENUM (
  'pending',     -- created, not yet queued
  'scheduled',   -- has a future scheduled_at, waiting to be enqueued
  'queued',      -- job pushed to BullMQ, waiting for a worker
  'processing',  -- worker has picked up the job and is sending it
  'sent',        -- delivered successfully via SMTP
  'failed',      -- worker exhausted retries / hit an unrecoverable error
  'cancelled'    -- cancelled before it was sent
);

CREATE TABLE IF NOT EXISTS emails (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency: lets API callers safely retry the same "send email"
  -- request without creating duplicate rows / duplicate sends.
  idempotency_key   VARCHAR(255) NOT NULL UNIQUE,

  sender            VARCHAR(320) NOT NULL,
  recipient         VARCHAR(320) NOT NULL,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,

  status            email_status NOT NULL DEFAULT 'pending',

  -- Scheduling / delivery timestamps
  scheduled_at      TIMESTAMPTZ,           -- when it should be sent (NULL = as soon as possible)
  sent_at           TIMESTAMPTZ,           -- when it was actually sent

  -- BullMQ linkage
  bullmq_job_id     VARCHAR(255),          -- job.id once enqueued

  attempts          INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_status ON emails (status);
CREATE INDEX IF NOT EXISTS idx_emails_scheduled_at ON emails (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_emails_bullmq_job_id ON emails (bullmq_job_id);

-- Keep updated_at fresh on every row update.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emails_updated_at ON emails;
CREATE TRIGGER trg_emails_updated_at
  BEFORE UPDATE ON emails
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
