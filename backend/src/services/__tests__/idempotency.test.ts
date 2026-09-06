import { describe, expect, it } from "vitest";
import { deriveEmailIdempotencyKey } from "../idempotency";

describe("deriveEmailIdempotencyKey", () => {
  it("is deterministic for the same batch key + recipient", () => {
    const a = deriveEmailIdempotencyKey("batch-1", "alice@example.com");
    const b = deriveEmailIdempotencyKey("batch-1", "alice@example.com");
    expect(a).toBe(b);
  });

  it("is case-insensitive on the recipient address", () => {
    const a = deriveEmailIdempotencyKey("batch-1", "Alice@Example.com");
    const b = deriveEmailIdempotencyKey("batch-1", "alice@example.com");
    expect(a).toBe(b);
  });

  it("differs across recipients within the same batch", () => {
    const a = deriveEmailIdempotencyKey("batch-1", "alice@example.com");
    const b = deriveEmailIdempotencyKey("batch-1", "bob@example.com");
    expect(a).not.toBe(b);
  });

  it("differs across batch keys for the same recipient", () => {
    const a = deriveEmailIdempotencyKey("batch-1", "alice@example.com");
    const b = deriveEmailIdempotencyKey("batch-2", "alice@example.com");
    expect(a).not.toBe(b);
  });

  it("produces a bounded-length hex string regardless of input length", () => {
    const key = deriveEmailIdempotencyKey("x".repeat(500), "alice@example.com");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
