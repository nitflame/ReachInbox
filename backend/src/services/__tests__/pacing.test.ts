import { describe, expect, it } from "vitest";
import { computeEffectiveDelayMs, computeScheduledAt } from "../pacing";

describe("computeEffectiveDelayMs", () => {
  it("uses the requested delay when it already satisfies the hourly limit", () => {
    // 10s apart -> 360/hr, well under a 500/hr cap.
    const { effectiveDelayMs } = computeEffectiveDelayMs({
      requestedDelayMs: 10_000,
      hourlyLimit: 500,
    });
    expect(effectiveDelayMs).toBe(10_000);
  });

  it("widens the delay when the requested spacing would exceed the hourly limit", () => {
    // 1s apart would be 3600/hr, far above a 100/hr cap -> must widen to 36s.
    const { effectiveDelayMs, minSpacingForHourlyLimitMs } = computeEffectiveDelayMs({
      requestedDelayMs: 1_000,
      hourlyLimit: 100,
    });
    expect(minSpacingForHourlyLimitMs).toBe(36_000);
    expect(effectiveDelayMs).toBe(36_000);
  });

  it("defaults hourlyLimit=1 to a full hour of spacing", () => {
    const { effectiveDelayMs } = computeEffectiveDelayMs({
      requestedDelayMs: 0,
      hourlyLimit: 1,
    });
    expect(effectiveDelayMs).toBe(3_600_000);
  });

  it("rejects a negative requested delay", () => {
    expect(() => computeEffectiveDelayMs({ requestedDelayMs: -1, hourlyLimit: 10 })).toThrow();
  });

  it("rejects a non-positive hourly limit", () => {
    expect(() => computeEffectiveDelayMs({ requestedDelayMs: 0, hourlyLimit: 0 })).toThrow();
  });
});

describe("computeScheduledAt", () => {
  it("spaces recipients out linearly from the start time", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    expect(computeScheduledAt(start, 0, 5_000).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(computeScheduledAt(start, 1, 5_000).toISOString()).toBe("2026-01-01T00:00:05.000Z");
    expect(computeScheduledAt(start, 3, 5_000).toISOString()).toBe("2026-01-01T00:00:15.000Z");
  });
});
