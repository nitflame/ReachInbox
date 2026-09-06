import { describe, expect, it } from "vitest";
import { notifyRateLimitReached } from "../slackNotifier.service";
import { createFakeAtomics } from "./fakeAtomics";

const baseEvent = {
  senderId: "sender-1",
  senderEmail: "sender@example.com",
  limit: 100,
  hourWindowKey: "2026-01-01T14:00:00.000Z",
  nextAvailableAt: new Date("2026-01-01T15:00:00.000Z"),
};

describe("notifyRateLimitReached", () => {
  it("is safe with no Slack connection configured (does not throw, reports no-slack-connection)", async () => {
    const atomics = createFakeAtomics();
    const outcome = await notifyRateLimitReached(baseEvent, { atomics });
    expect(outcome).toEqual({ sent: false, reason: "no-slack-connection" });
  });

  it("does not send a duplicate notification for the same sender/hour", async () => {
    const atomics = createFakeAtomics();
    const first = await notifyRateLimitReached(baseEvent, { atomics });
    const second = await notifyRateLimitReached(baseEvent, { atomics });

    expect(first).toEqual({ sent: false, reason: "no-slack-connection" }); // claimed the slot, but no connection to deliver through
    expect(second).toEqual({ sent: false, reason: "already-notified" });
  });

  it("allows a fresh notification once the hour window changes", async () => {
    const atomics = createFakeAtomics();
    await notifyRateLimitReached(baseEvent, { atomics });
    const nextHour = await notifyRateLimitReached(
      { ...baseEvent, hourWindowKey: "2026-01-01T15:00:00.000Z" },
      { atomics }
    );

    expect(nextHour).not.toEqual({ sent: false, reason: "already-notified" });
  });

  it("tracks each sender independently", async () => {
    const atomics = createFakeAtomics();
    await notifyRateLimitReached(baseEvent, { atomics });
    const otherSender = await notifyRateLimitReached({ ...baseEvent, senderId: "sender-2" }, { atomics });

    expect(otherSender).not.toEqual({ sent: false, reason: "already-notified" });
  });

  it("claims the notification slot exactly once even under concurrent callers", async () => {
    const atomics = createFakeAtomics();

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => notifyRateLimitReached(baseEvent, { atomics }))
    );

    const claimedCount = outcomes.filter(
      (o) => !(o.sent === false && o.reason === "already-notified")
    ).length;
    expect(claimedCount).toBe(1);
  });
});
