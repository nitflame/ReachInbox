import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { getEmailAnalyticsHandler } from "../../controllers/emails.controller";
import * as analyticsModel from "../../models/analytics.model";

vi.mock("../../models/analytics.model", () => ({
  getEmailAnalytics: vi.fn(),
}));

describe("Analytics Route & Controller Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests with HTTP 401 Unauthorized", async () => {
    const req = {
      user: undefined,
      query: {},
    } as unknown as Request;

    let statusCode = 200;
    let jsonBody: any = null;

    const res = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    } as unknown as Response;

    await getEmailAnalyticsHandler(req, res, () => {});

    expect(statusCode).toBe(401);
    expect(jsonBody).toEqual({ error: "Unauthorized" });
    expect(analyticsModel.getEmailAnalytics).not.toHaveBeenCalled();
  });

  it("strictly scopes analytics query to req.user.id and ignores client-supplied userId", async () => {
    const mockData: analyticsModel.EmailAnalyticsResult = {
      scheduled: 5,
      sent: 20,
      failed: 1,
      total: 26,
      successRate: 95.2,
      hourlySent: 3,
      hourlyLimit: 100,
      resetsInMinutes: 45,
      daily: [{ date: "2026-09-05", sent: 20, failed: 1, scheduled: 5, total: 26 }],
      statusBreakdown: [
        { status: "sent", count: 20, percentage: 76.9 },
        { status: "scheduled", count: 5, percentage: 19.2 },
        { status: "failed", count: 1, percentage: 3.8 },
      ],
      topRecipients: [{ recipient: "target@example.com", emails: 4, sent: 4, failed: 0 }],
    };

    vi.mocked(analyticsModel.getEmailAnalytics).mockResolvedValueOnce(mockData);

    const req = {
      user: { id: "authenticated-user-uuid-123" },
      query: {
        range: "7d",
        userId: "malicious-spoofed-user-id", // Should be ignored!
      },
    } as unknown as Request;

    let jsonBody: any = null;
    const res = {
      json: (body: any) => {
        jsonBody = body;
      },
    } as unknown as Response;

    await getEmailAnalyticsHandler(req, res, () => {});

    // Must be called with authenticated user's ID, not spoofed query param!
    expect(analyticsModel.getEmailAnalytics).toHaveBeenCalledWith("authenticated-user-uuid-123", "7d");
    expect(jsonBody).toEqual(mockData);
    expect(jsonBody.successRate).toBe(95.2);
  });

  it("returns zero counts and 0% success rate on empty dataset", async () => {
    const emptyData: analyticsModel.EmailAnalyticsResult = {
      scheduled: 0,
      sent: 0,
      failed: 0,
      total: 0,
      successRate: 0,
      hourlySent: 0,
      hourlyLimit: 100,
      resetsInMinutes: 60,
      daily: [],
      statusBreakdown: [
        { status: "sent", count: 0, percentage: 0 },
        { status: "scheduled", count: 0, percentage: 0 },
        { status: "failed", count: 0, percentage: 0 },
      ],
      topRecipients: [],
    };

    vi.mocked(analyticsModel.getEmailAnalytics).mockResolvedValueOnce(emptyData);

    const req = {
      user: { id: "empty-user-id" },
      query: { range: "today" },
    } as unknown as Request;

    let jsonBody: any = null;
    const res = {
      json: (body: any) => {
        jsonBody = body;
      },
    } as unknown as Response;

    await getEmailAnalyticsHandler(req, res, () => {});

    expect(analyticsModel.getEmailAnalytics).toHaveBeenCalledWith("empty-user-id", "today");
    expect(jsonBody.total).toBe(0);
    expect(jsonBody.sent).toBe(0);
    expect(jsonBody.failed).toBe(0);
    expect(jsonBody.successRate).toBe(0);
  });

  it("passes errors gracefully to next() without crashing", async () => {
    const dbError = new Error("Database connection lost");
    vi.mocked(analyticsModel.getEmailAnalytics).mockRejectedValueOnce(dbError);

    const req = {
      user: { id: "error-user-id" },
      query: {},
    } as unknown as Request;

    let caughtError: any = null;
    const next = (err: any) => {
      caughtError = err;
    };

    const res = {
      json: vi.fn(),
    } as unknown as Response;

    await getEmailAnalyticsHandler(req, res, next);

    expect(caughtError).toBe(dbError);
  });
});
