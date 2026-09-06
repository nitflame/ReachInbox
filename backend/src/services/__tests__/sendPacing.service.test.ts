import { describe, expect, it } from "vitest";
import { reserveSendSlot } from "../sendPacing.service";
import { createFakeAtomics } from "./fakeAtomics";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("reserveSendSlot - single caller", () => {
  it("allows the first send immediately", async () => {
    const atomics = createFakeAtomics();
    const slot = await reserveSendSlot(atomics, "sender-1", "email-1", 2000, NOW);
    expect(slot.nextAllowedAt.getTime()).toBe(NOW.getTime());
  });

  it("pushes the second send back by at least minDelayMs", async () => {
    const atomics = createFakeAtomics();
    await reserveSendSlot(atomics, "sender-1", "email-1", 2000, NOW);
    const second = await reserveSendSlot(atomics, "sender-1", "email-2", 2000, NOW);
    expect(second.nextAllowedAt.getTime()).toBe(NOW.getTime() + 2000);
  });

  it("does not push the slot forward further than necessary if called after the gap has passed", async () => {
    const atomics = createFakeAtomics();
    await reserveSendSlot(atomics, "sender-1", "email-1", 2000, NOW);
    const later = new Date(NOW.getTime() + 5000);
    const third = await reserveSendSlot(atomics, "sender-1", "email-3", 2000, later);
    expect(third.nextAllowedAt.getTime()).toBe(later.getTime());
  });
});

describe("reserveSendSlot - delayed job waking up (fixing infinite rescheduling)", () => {
  it("returns the exact reserved slot when the same job wakes up at its reserved time", async () => {
    const atomics = createFakeAtomics();
    const delay = 2000;

    // Job A reserves 10:00:00 and sends
    const slotA = await reserveSendSlot(atomics, "sender-1", "job-A", delay, NOW);
    expect(slotA.nextAllowedAt.getTime()).toBe(NOW.getTime());

    // Job B reserves 10:00:02 and gets delayed
    const slotB1 = await reserveSendSlot(atomics, "sender-1", "job-B", delay, NOW);
    const targetBTime = NOW.getTime() + delay;
    expect(slotB1.nextAllowedAt.getTime()).toBe(targetBTime);

    // At 10:00:02, Job B wakes up and calls reserveSendSlot again
    const wakeTime = new Date(targetBTime);
    const slotB2 = await reserveSendSlot(atomics, "sender-1", "job-B", delay, wakeTime);

    // Job B MUST get 10:00:02 (allowed to send now), NOT 10:00:04!
    expect(slotB2.nextAllowedAt.getTime()).toBe(targetBTime);
    expect(slotB2.nextAllowedAt.getTime()).toBeLessThanOrEqual(wakeTime.getTime());
  });

  it("handles stale pacing reservation when a newer job sent while this job was delayed", async () => {
    const atomics = createFakeAtomics();
    const delay = 2000;

    // Job A reserves 10:00:00
    await reserveSendSlot(atomics, "sender-1", "job-A", delay, NOW);

    // Job B reserves 10:00:02
    await reserveSendSlot(atomics, "sender-1", "job-B", delay, NOW);

    // At 10:00:04, Job C arrives and sends
    const t4 = new Date(NOW.getTime() + 4000);
    const slotC = await reserveSendSlot(atomics, "sender-1", "job-C", delay, t4);
    expect(slotC.nextAllowedAt.getTime()).toBe(t4.getTime());

    // At 10:00:05, Job B wakes up late. Since Job C sent at 10:00:04, sending at 10:00:05 is too close (minDelay 2000ms).
    // Job B's old reservation (10:00:02) is STALE. It must get re-reserved to 10:00:06!
    const t5 = new Date(NOW.getTime() + 5000);
    const slotB_late = await reserveSendSlot(atomics, "sender-1", "job-B", delay, t5);
    expect(slotB_late.nextAllowedAt.getTime()).toBe(NOW.getTime() + 6000);
  });
});

describe("reserveSendSlot - disabled pacing", () => {
  it("always allows immediately when minDelayMs <= 0", async () => {
    const atomics = createFakeAtomics();
    const first = await reserveSendSlot(atomics, "sender-1", "email-1", 0, NOW);
    const second = await reserveSendSlot(atomics, "sender-1", "email-2", 0, NOW);
    expect(first.nextAllowedAt.getTime()).toBe(NOW.getTime());
    expect(second.nextAllowedAt.getTime()).toBe(NOW.getTime());
  });
});

describe("reserveSendSlot - concurrent callers (simulating multiple worker processes/concurrency)", () => {
  it("serializes N concurrent reservations into N distinct, evenly-spaced slots", async () => {
    const atomics = createFakeAtomics();
    const minDelayMs = 1000;
    const n = 5;

    const slots = await Promise.all(
      Array.from({ length: n }, (_, i) => reserveSendSlot(atomics, "sender-race", `job-${i}`, minDelayMs, NOW))
    );

    const sorted = slots.map((s) => s.nextAllowedAt.getTime()).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBe(minDelayMs);
    }
    expect(sorted[0]).toBe(NOW.getTime());
  });
});

describe("reserveSendSlot - multiple senders", () => {
  it("paces each sender independently", async () => {
    const atomics = createFakeAtomics();
    await reserveSendSlot(atomics, "sender-A", "email-A", 5000, NOW);
    const senderB = await reserveSendSlot(atomics, "sender-B", "email-B", 5000, NOW);
    expect(senderB.nextAllowedAt.getTime()).toBe(NOW.getTime());
  });
});
