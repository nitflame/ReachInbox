import { describe, expect, it } from "vitest";
import { floorToHour, hourWindowKey, nextHourStart } from "../hourWindow";

describe("floorToHour", () => {
  it("zeroes out minutes/seconds/ms, keeping the hour", () => {
    const d = new Date("2026-03-14T09:37:42.123Z");
    expect(floorToHour(d).toISOString()).toBe("2026-03-14T09:00:00.000Z");
  });
});

describe("nextHourStart", () => {
  it("returns the start of the following UTC hour", () => {
    const d = new Date("2026-03-14T09:37:42.123Z");
    expect(nextHourStart(d).toISOString()).toBe("2026-03-14T10:00:00.000Z");
  });

  it("rolls over midnight/year boundaries correctly", () => {
    const d = new Date("2025-12-31T23:59:59.999Z");
    expect(nextHourStart(d).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("hourWindowKey", () => {
  it("is stable for any two timestamps within the same UTC hour", () => {
    const a = hourWindowKey(new Date("2026-03-14T09:00:00.000Z"));
    const b = hourWindowKey(new Date("2026-03-14T09:59:59.999Z"));
    expect(a).toBe(b);
  });

  it("differs across an hour boundary", () => {
    const a = hourWindowKey(new Date("2026-03-14T09:59:59.999Z"));
    const b = hourWindowKey(new Date("2026-03-14T10:00:00.000Z"));
    expect(a).not.toBe(b);
  });
});
