// Runs before any test file is imported. The unit tests below never talk
// to a real Postgres/Redis/SMTP server (all infra is dependency-injected
// and mocked in the tests themselves), but importing the source modules
// still evaluates src/config/env.ts, which requires DATABASE_URL and
// REDIS_URL to be present. These dummy values just satisfy that check.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
