import { describe, expect, it } from "vitest";
import { scheduleEmailsSchema } from "../email.schema";

const base = {
  sender: "sender@example.com",
  subject: "Hi",
  body: "Hello there",
};

describe("scheduleEmailsSchema", () => {
  it("accepts a single `recipient`", () => {
    const parsed = scheduleEmailsSchema.parse({ ...base, recipient: "to@example.com" });
    expect(parsed.recipient).toBe("to@example.com");
  });

  it("accepts a `recipients` array", () => {
    const parsed = scheduleEmailsSchema.parse({
      ...base,
      recipients: ["a@example.com", "b@example.com"],
    });
    expect(parsed.recipients).toHaveLength(2);
  });

  it("rejects a request with neither `recipient` nor `recipients`", () => {
    expect(() => scheduleEmailsSchema.parse({ ...base })).toThrow();
  });

  it("rejects an invalid sender address", () => {
    expect(() =>
      scheduleEmailsSchema.parse({ ...base, sender: "not-an-email", recipient: "to@example.com" })
    ).toThrow();
  });

  it("rejects an empty subject", () => {
    expect(() =>
      scheduleEmailsSchema.parse({ ...base, subject: "", recipient: "to@example.com" })
    ).toThrow();
  });

  it("rejects a non-ISO startTime", () => {
    expect(() =>
      scheduleEmailsSchema.parse({
        ...base,
        recipient: "to@example.com",
        startTime: "tomorrow at 5pm",
      })
    ).toThrow();
  });

  it("accepts an ISO 8601 startTime with offset", () => {
    const parsed = scheduleEmailsSchema.parse({
      ...base,
      recipient: "to@example.com",
      startTime: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.startTime).toBe("2026-01-01T00:00:00.000Z");
  });

  it("coerces delayBetweenEmailsMs and hourlyLimit from numeric strings", () => {
    const parsed = scheduleEmailsSchema.parse({
      ...base,
      recipient: "to@example.com",
      delayBetweenEmailsMs: "3000",
      hourlyLimit: "50",
    });
    expect(parsed.delayBetweenEmailsMs).toBe(3000);
    expect(parsed.hourlyLimit).toBe(50);
  });
});
