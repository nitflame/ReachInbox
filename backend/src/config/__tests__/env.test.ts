import { describe, expect, it } from "vitest";
import { buildEnv } from "../env";

const requiredBase = {
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
};

describe("buildEnv", () => {
  it("applies sensible defaults when optional vars are absent", () => {
    const env = buildEnv({ ...requiredBase });
    expect(env.WORKER_CONCURRENCY).toBe(5);
    expect(env.DEFAULT_SEND_DELAY_MS).toBe(2000);
    expect(env.DEFAULT_HOURLY_LIMIT).toBe(100);
    expect(env.DEV_DEFAULT_USER_EMAIL).toBe("dev@reachinbox.local");
  });

  it("reads WORKER_CONCURRENCY from the environment (not hardcoded)", () => {
    const env = buildEnv({ ...requiredBase, WORKER_CONCURRENCY: "17" });
    expect(env.WORKER_CONCURRENCY).toBe(17);
  });

  it("reads DEFAULT_SEND_DELAY_MS and DEFAULT_HOURLY_LIMIT from the environment", () => {
    const env = buildEnv({
      ...requiredBase,
      DEFAULT_SEND_DELAY_MS: "500",
      DEFAULT_HOURLY_LIMIT: "25",
    });
    expect(env.DEFAULT_SEND_DELAY_MS).toBe(500);
    expect(env.DEFAULT_HOURLY_LIMIT).toBe(25);
  });

  it("rejects a non-positive WORKER_CONCURRENCY", () => {
    expect(() => buildEnv({ ...requiredBase, WORKER_CONCURRENCY: "0" })).toThrow();
  });

  it("rejects a negative DEFAULT_SEND_DELAY_MS", () => {
    expect(() => buildEnv({ ...requiredBase, DEFAULT_SEND_DELAY_MS: "-1" })).toThrow();
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => buildEnv({ REDIS_URL: "redis://localhost:6379" })).toThrow();
  });

  it("throws when REDIS_URL is missing", () => {
    expect(() => buildEnv({ DATABASE_URL: requiredBase.DATABASE_URL })).toThrow();
  });
});
