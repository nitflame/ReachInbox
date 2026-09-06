import { describe, expect, it } from "vitest";
import { checkAndConsumeHourlyLimit } from "../rateLimiter.service";
import { createFakeAtomics } from "./fakeAtomics";

const NOW = new Date("2026-01-01T14:23:00.000Z");

describe("checkAndConsumeHourlyLimit - single caller", () => {
  it("allows requests up to the limit and rejects the one after", async () => {
    const atomics = createFakeAtomics();
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await checkAndConsumeHourlyLimit(atomics, "sender-1", 2, NOW));
    }

    expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
  });

  it("reports the correct hour window and next-hour-start on rejection", async () => {
    const atomics = createFakeAtomics();
    await checkAndConsumeHourlyLimit(atomics, "sender-1", 1, NOW);
    const second = await checkAndConsumeHourlyLimit(atomics, "sender-1", 1, NOW);

    expect(second.allowed).toBe(false);
    expect(second.hourWindowKey).toBe("2026-01-01T14:00:00.000Z");
    expect(second.nextHourStart.toISOString()).toBe("2026-01-01T15:00:00.000Z");
  });
});

describe("checkAndConsumeHourlyLimit - concurrent callers (simulating multiple worker processes)", () => {
  it("never lets more than `limit` concurrent callers through, even when all fire at once", async () => {
    const atomics = createFakeAtomics();
    const limit = 2;
    const attempts = 10;

    // All 10 "workers" race to consume from the same 2-slot bucket at once.
    const outcomes = await Promise.all(
      Array.from({ length: attempts }, () => checkAndConsumeHourlyLimit(atomics, "sender-race", limit, NOW))
    );

    const allowedCount = outcomes.filter((o) => o.allowed).length;
    expect(allowedCount).toBe(limit);
  });
});

describe("checkAndConsumeHourlyLimit - multiple senders", () => {
  it("gives each sender an independent quota", async () => {
    const atomics = createFakeAtomics();

    const senderA1 = await checkAndConsumeHourlyLimit(atomics, "sender-A", 1, NOW);
    const senderA2 = await checkAndConsumeHourlyLimit(atomics, "sender-A", 1, NOW);
    const senderB1 = await checkAndConsumeHourlyLimit(atomics, "sender-B", 1, NOW);

    expect(senderA1.allowed).toBe(true);
    expect(senderA2.allowed).toBe(false); // sender A is now exhausted
    expect(senderB1.allowed).toBe(true); // sender B's quota is untouched by A's usage
  });
});

describe("checkAndConsumeHourlyLimit - hour rollover", () => {
  it("resets the quota once the hour window advances", async () => {
    const atomics = createFakeAtomics();
    const hourOne = new Date("2026-01-01T14:59:59.000Z");
    const hourTwo = new Date("2026-01-01T15:00:01.000Z");

    await checkAndConsumeHourlyLimit(atomics, "sender-1", 1, hourOne);
    const stillHourOne = await checkAndConsumeHourlyLimit(atomics, "sender-1", 1, hourOne);
    const nowHourTwo = await checkAndConsumeHourlyLimit(atomics, "sender-1", 1, hourTwo);

    expect(stillHourOne.allowed).toBe(false);
    expect(nowHourTwo.allowed).toBe(true);
  });
});
