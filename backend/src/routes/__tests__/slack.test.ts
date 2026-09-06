import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  slackConnectHandler,
  slackCallbackHandler,
  getSlackStatusHandler,
  disconnectSlackHandler,
} from "../../controllers/slack.controller";
import * as slackOAuthService from "../../services/slackOAuth.service";
import * as slackModel from "../../models/slack.model";
import { notifyRateLimitReached } from "../../services/slackNotifier.service";
import type { SlackConnectionRecord } from "../../models/slack.model";
import type { RedisAtomics } from "../../services/redisAtomics";

vi.mock("../../services/slackOAuth.service", async () => {
  const actual = await vi.importActual<typeof slackOAuthService>("../../services/slackOAuth.service");
  return {
    ...actual,
    exchangeSlackCodeForTokens: vi.fn(),
    sendSlackMessage: vi.fn(),
  };
});

describe("Milestone B6: Slack OAuth & Rate-Limit Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Slack OAuth Connect & CSRF State Generation", () => {
    it("generates Slack auth URL and stores CSRF state in session", async () => {
      const mockSession: Record<string, any> = {};
      const req = {
        session: mockSession,
        user: { id: "user-1" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      await slackConnectHandler(req, res, () => {});

      expect(mockSession.slackOauthState).toBeDefined();
      expect(typeof mockSession.slackOauthState).toBe("string");
      expect(redirectUrl).toContain("slack.com/oauth/v2/authorize");
      expect(redirectUrl).toContain(`state=${mockSession.slackOauthState}`);
    });
  });

  describe("2. Slack OAuth Callback & State Validation", () => {
    it("rejects callback if state is missing", async () => {
      const req = {
        query: { code: "valid-code" },
        session: { slackOauthState: "expected-state" },
        user: { id: "user-1" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      await slackCallbackHandler(req, res);

      expect(redirectUrl).toContain("error=invalid_state");
      expect(req.session.slackOauthState).toBeUndefined(); // state consumed
    });

    it("rejects callback if state mismatches", async () => {
      const req = {
        query: { code: "valid-code", state: "wrong-state" },
        session: { slackOauthState: "expected-state" },
        user: { id: "user-1" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      await slackCallbackHandler(req, res);

      expect(redirectUrl).toContain("error=invalid_state");
    });

    it("exchanges code server-side and saves Slack connection for user", async () => {
      const req = {
        query: { code: "valid-slack-code", state: "state-123" },
        session: { slackOauthState: "state-123" },
        user: { id: "user-1" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      vi.mocked(slackOAuthService.exchangeSlackCodeForTokens).mockResolvedValueOnce({
        ok: true,
        access_token: "xoxb-mock-token",
        team: { id: "T123", name: "Engineering Team" },
        incoming_webhook: {
          url: "https://hooks.slack.com/services/T123/B123/X123",
          channel: "#alerts",
          channel_id: "C123",
        },
      });

      const upsertSpy = vi.spyOn(slackModel, "upsertSlackConnection").mockResolvedValueOnce({
        id: "conn-1",
        user_id: "user-1",
        team_id: "T123",
        team_name: "Engineering Team",
        channel_id: "C123",
        channel_name: "#alerts",
        webhook_url: "https://hooks.slack.com/services/T123/B123/X123",
        access_token: "xoxb-mock-token",
        bot_user_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await slackCallbackHandler(req, res);

      expect(upsertSpy).toHaveBeenCalledWith({
        userId: "user-1",
        teamId: "T123",
        teamName: "Engineering Team",
        channelId: "C123",
        channelName: "#alerts",
        webhookUrl: "https://hooks.slack.com/services/T123/B123/X123",
        accessToken: "xoxb-mock-token",
        botUserId: null,
      });

      expect(redirectUrl).toContain("success=true");
    });
  });

  describe("3. Status, Disconnect & User Isolation", () => {
    it("getSlackStatusHandler returns safe info ONLY and NEVER returns access token", async () => {
      const mockConn: SlackConnectionRecord = {
        id: "conn-1",
        user_id: "user-1",
        team_id: "T123",
        team_name: "Acme Corp Workspace",
        channel_id: "C999",
        channel_name: "#email-alerts",
        webhook_url: "https://hooks.slack.com/secret-url",
        access_token: "xoxb-secret-access-token",
        bot_user_id: "U123",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
      };

      vi.spyOn(slackModel, "findSlackConnectionByUserId").mockResolvedValueOnce(mockConn);

      const req = { user: { id: "user-1" } } as Request;
      let jsonBody: any = null;
      const res = {
        json: (data: any) => {
          jsonBody = data;
        },
      } as unknown as Response;

      await getSlackStatusHandler(req, res, () => {});

      expect(jsonBody).toEqual({
        connected: true,
        teamName: "Acme Corp Workspace",
        channel: "#email-alerts",
        createdAt: mockConn.created_at,
      });
      expect(jsonBody.access_token).toBeUndefined();
      expect(jsonBody.webhook_url).toBeUndefined();
    });

    it("getSlackStatusHandler returns connected: false when no connection exists", async () => {
      vi.spyOn(slackModel, "findSlackConnectionByUserId").mockResolvedValueOnce(null);

      const req = { user: { id: "user-2" } } as Request;
      let jsonBody: any = null;
      const res = {
        json: (data: any) => {
          jsonBody = data;
        },
      } as unknown as Response;

      await getSlackStatusHandler(req, res, () => {});

      expect(jsonBody).toEqual({ connected: false });
    });

    it("disconnectSlackHandler removes stored Slack connection", async () => {
      const deleteSpy = vi.spyOn(slackModel, "deleteSlackConnectionByUserId").mockResolvedValueOnce(true);

      const req = { user: { id: "user-1" } } as Request;
      let jsonBody: any = null;
      const res = {
        json: (data: any) => {
          jsonBody = data;
        },
      } as unknown as Response;

      await disconnectSlackHandler(req, res, () => {});

      expect(deleteSpy).toHaveBeenCalledWith("user-1");
      expect(jsonBody).toEqual({ success: true, message: "Slack connection disconnected" });
    });
  });

  describe("4. Slack Rate-Limit Notifications & Deduplication", () => {
    it("delivers Slack message when connected user hits rate limit", async () => {
      const claimedKeys = new Set<string>();
      const atomics: RedisAtomics = {
        reserveNextSlot: vi.fn(),
        incrIfUnderLimit: vi.fn(),
        claimOnce: vi.fn(async (key: string) => {
          if (claimedKeys.has(key)) return false;
          claimedKeys.add(key);
          return true;
        }),
      };

      const mockSender = {
        id: "sender-1",
        user_id: "user-1",
        email: "sender@example.com",
        display_name: null,
        hourly_limit: 100,
        created_at: new Date(),
      };

      const mockSlackConn: SlackConnectionRecord = {
        id: "conn-1",
        user_id: "user-1",
        team_id: "T123",
        team_name: "Acme",
        channel_id: "C123",
        channel_name: "#alerts",
        webhook_url: "https://hooks.slack.com/services/test",
        access_token: "xoxb-token",
        bot_user_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockSendMessage = vi.fn(async () => true);

      const outcome = await notifyRateLimitReached(
        {
          senderId: "sender-1",
          senderEmail: "sender@example.com",
          limit: 100,
          hourWindowKey: "2026-09-05T15:00:00.000Z",
          nextAvailableAt: new Date("2026-09-05T16:00:00.000Z"),
        },
        {
          atomics,
          findSenderById: vi.fn(async () => mockSender),
          findSlackConnectionByUserId: vi.fn(async () => mockSlackConn),
          sendSlackMessage: mockSendMessage,
        }
      );

      expect(outcome).toEqual({ sent: true });
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookUrl: "https://hooks.slack.com/services/test",
          text: expect.stringContaining("sender@example.com"),
        })
      );
    });

    it("suppresses duplicate notifications within the same hour window", async () => {
      const claimedKeys = new Set<string>();
      const atomics: RedisAtomics = {
        reserveNextSlot: vi.fn(),
        incrIfUnderLimit: vi.fn(),
        claimOnce: vi.fn(async (key: string) => {
          if (claimedKeys.has(key)) return false;
          claimedKeys.add(key);
          return true;
        }),
      };

      const mockSendMessage = vi.fn(async () => true);
      const deps = {
        atomics,
        findSenderById: vi.fn(async () => ({ id: "sender-1", user_id: "user-1" } as any)),
        findSlackConnectionByUserId: vi.fn(async () => ({ webhook_url: "http://slack" } as any)),
        sendSlackMessage: mockSendMessage,
      };

      const event = {
        senderId: "sender-1",
        senderEmail: "sender@example.com",
        limit: 100,
        hourWindowKey: "2026-09-05T15:00:00.000Z",
        nextAvailableAt: new Date("2026-09-05T16:00:00.000Z"),
      };

      const first = await notifyRateLimitReached(event, deps);
      const second = await notifyRateLimitReached(event, deps);

      expect(first).toEqual({ sent: true });
      expect(second).toEqual({ sent: false, reason: "already-notified" });
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it("does not fail or throw if Slack connection is missing or Slack API fails", async () => {
      const atomics: RedisAtomics = {
        reserveNextSlot: vi.fn(),
        incrIfUnderLimit: vi.fn(),
        claimOnce: vi.fn(async () => true),
      };

      const mockFailingSendMessage = vi.fn(async () => {
        throw new Error("Slack API timeout");
      });

      const outcome = await notifyRateLimitReached(
        {
          senderId: "sender-1",
          senderEmail: "sender@example.com",
          limit: 100,
          hourWindowKey: "2026-09-05T15:00:00.000Z",
          nextAvailableAt: new Date("2026-09-05T16:00:00.000Z"),
        },
        {
          atomics,
          findSenderById: vi.fn(async () => ({ id: "sender-1", user_id: "user-1" } as any)),
          findSlackConnectionByUserId: vi.fn(async () => ({ webhook_url: "http://slack" } as any)),
          sendSlackMessage: mockFailingSendMessage,
        }
      );

      expect(outcome).toEqual({ sent: false, reason: "no-slack-connection" });
    });
  });
});
