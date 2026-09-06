-- 003_sender_hourly_limit.sql
-- The hourly send-rate policy enforced by the worker (rateLimiter.service.ts)
-- is per-sender, not per-request: a "From" address has one throughput cap
-- regardless of which scheduling request originally created it.

ALTER TABLE senders
  ADD COLUMN IF NOT EXISTS hourly_limit INTEGER NOT NULL DEFAULT 100;

ALTER TABLE senders
  ADD CONSTRAINT senders_hourly_limit_positive CHECK (hourly_limit > 0);
