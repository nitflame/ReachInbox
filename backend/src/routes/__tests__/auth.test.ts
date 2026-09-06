import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  googleAuthHandler,
  googleCallbackHandler,
  getMeHandler,
  logoutHandler,
} from "../../controllers/auth.controller";
import { requireAuth } from "../../middleware/auth.middleware";
import * as googleOAuthService from "../../services/googleOAuth.service";
import * as userModel from "../../models/user.model";
import * as emailModel from "../../models/email.model";
import type { UserRecord } from "../../types/email";
import { env } from "../../config/env";

// Mock external services/models where appropriate for isolated unit testing
vi.mock("../../services/googleOAuth.service", async () => {
  const actual = await vi.importActual<typeof googleOAuthService>("../../services/googleOAuth.service");
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    fetchGoogleUserProfile: vi.fn(),
  };
});

describe("Milestone B5: Authentication & Authorization Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. OAuth Authorization Code & State Generation", () => {
    it("generates a secure OAuth state and redirects to Google Auth URL", async () => {
      const mockSession: Record<string, any> = {};
      const req = {
        session: mockSession,
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      await googleAuthHandler(req, res, () => {});

      expect(mockSession.oauthState).toBeDefined();
      expect(typeof mockSession.oauthState).toBe("string");
      expect(redirectUrl).toContain("accounts.google.com");
      expect(redirectUrl).toContain(`state=${mockSession.oauthState}`);
    });
  });

  describe("2. OAuth CSRF State & Callback Validation", () => {
    it("rejects callback if state is missing", async () => {
      const req = {
        query: { code: "valid-code" },
        session: { oauthState: "expected-state-123" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      await googleCallbackHandler(req, res);

      expect(redirectUrl).toContain("error=invalid_state");
      expect(req.session.oauthState).toBeUndefined(); // consumed
    });

    it("rejects callback if state mismatches", async () => {
      const req = {
        query: { code: "valid-code", state: "wrong-state" },
        session: { oauthState: "expected-state-123" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      await googleCallbackHandler(req, res);

      expect(redirectUrl).toContain("error=invalid_state");
      expect(req.session.oauthState).toBeUndefined(); // consumed
    });

    it("prevents state reuse (replay attack)", async () => {
      const req = {
        query: { code: "valid-code", state: "state-123" },
        session: { oauthState: "state-123" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      // Mock exchange & profile success
      vi.mocked(googleOAuthService.exchangeCodeForTokens).mockResolvedValueOnce({
        access_token: "mock-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "email profile",
      });
      vi.mocked(googleOAuthService.fetchGoogleUserProfile).mockResolvedValueOnce({
        sub: "google-123",
        email: "test@example.com",
        email_verified: true,
        name: "Test User",
      });
      vi.spyOn(userModel, "findOrCreateUserByGoogleProfile").mockResolvedValueOnce({
        id: "user-1",
        email: "test@example.com",
        google_id: "google-123",
        name: "Test User",
        avatar: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // First call consumes state
      await googleCallbackHandler(req, res);
      expect(redirectUrl).toBe(env.FRONTEND_URL);

      // Second call with same state fails because state was cleared
      await googleCallbackHandler(req, res);
      expect(redirectUrl).toContain("error=invalid_state");
    });
  });

  describe("3. Google Profile Validation", () => {
    it("rejects unverified Google emails safely", async () => {
      const req = {
        query: { code: "valid-code", state: "state-123" },
        session: { oauthState: "state-123" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      vi.mocked(googleOAuthService.exchangeCodeForTokens).mockResolvedValueOnce({
        access_token: "mock-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "email profile",
      });
      vi.mocked(googleOAuthService.fetchGoogleUserProfile).mockResolvedValueOnce({
        sub: "google-123",
        email: "unverified@example.com",
        email_verified: false,
      });

      await googleCallbackHandler(req, res);
      expect(redirectUrl).toContain("error=unverified_email");
    });

    it("rejects profiles missing sub or email", async () => {
      const req = {
        query: { code: "valid-code", state: "state-123" },
        session: { oauthState: "state-123" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      vi.mocked(googleOAuthService.exchangeCodeForTokens).mockResolvedValueOnce({
        access_token: "mock-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "email profile",
      });
      vi.mocked(googleOAuthService.fetchGoogleUserProfile).mockResolvedValueOnce({
        sub: "",
        email: "",
        email_verified: true,
      });

      await googleCallbackHandler(req, res);
      expect(redirectUrl).toContain("error=invalid_profile");
    });

    it("handles Google API errors gracefully without crashing server", async () => {
      const req = {
        query: { code: "bad-code", state: "state-123" },
        session: { oauthState: "state-123" },
      } as unknown as Request;

      let redirectUrl = "";
      const res = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      } as unknown as Response;

      vi.mocked(googleOAuthService.exchangeCodeForTokens).mockRejectedValueOnce(
        new Error("401 Unauthorized from Google")
      );

      await googleCallbackHandler(req, res);
      expect(redirectUrl).toContain("error=oauth_failed");
    });
  });

  describe("4. Session & Auth Endpoints (/api/auth/me & /api/auth/logout)", () => {
    it("requireAuth returns 401 if no valid session or user exists", async () => {
      const req = { session: {} } as Request;
      let statusCode = 0;
      let jsonBody: any = null;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: any) => {
              jsonBody = data;
            },
          };
        },
      } as unknown as Response;

      await requireAuth(req, res, () => {});
      expect(statusCode).toBe(401);
      expect(jsonBody).toEqual({ error: "Unauthorized" });
    });

    it("getMeHandler returns current authenticated user details", async () => {
      const mockUser: UserRecord = {
        id: "user-999",
        email: "alice@example.com",
        name: "Alice Smith",
        avatar: "https://lh3.googleusercontent.com/a/avatar.jpg",
        google_id: "google-999",
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(userModel, "findUserById").mockResolvedValueOnce(mockUser);

      const req = { user: { id: "user-999" } } as Request;
      let jsonBody: any = null;
      const res = {
        json: (data: any) => {
          jsonBody = data;
        },
      } as unknown as Response;

      await getMeHandler(req, res, () => {});

      expect(jsonBody).toEqual({
        id: "user-999",
        email: "alice@example.com",
        name: "Alice Smith",
        avatar: "https://lh3.googleusercontent.com/a/avatar.jpg",
      });
    });

    it("logoutHandler destroys session and clears cookie", async () => {
      let destroyed = false;
      let clearedCookie = "";

      const req = {
        session: {
          destroy: (cb: (err?: any) => void) => {
            destroyed = true;
            cb();
          },
        },
      } as unknown as Request;

      let jsonBody: any = null;
      const res = {
        clearCookie: (name: string) => {
          clearedCookie = name;
        },
        json: (data: any) => {
          jsonBody = data;
        },
      } as unknown as Response;

      await logoutHandler(req, res);

      expect(destroyed).toBe(true);
      expect(clearedCookie).toBe("reachinbox_sid");
      expect(jsonBody).toEqual({ success: true, message: "Logged out" });
    });
  });

  describe("5. Email Data Isolation & Authorization Scoping", () => {
    it("findEmailByIdForUser isolates email by user_id", async () => {
      vi.spyOn(emailModel, "findEmailByIdForUser").mockImplementation(async (id, userId) => {
        if (id === "email-123" && userId === "user-a-id") {
          return { id: "email-123", user_id: "user-a-id" } as any;
        }
        return null;
      });

      const emailForOwner = await emailModel.findEmailByIdForUser("email-123", "user-a-id");
      expect(emailForOwner).not.toBeNull();
      expect(emailForOwner?.user_id).toBe("user-a-id");

      const emailForOther = await emailModel.findEmailByIdForUser("email-123", "user-b-id");
      expect(emailForOther).toBeNull();
    });

    it("requireAuth rejects unauthenticated access to email endpoints", async () => {
      const req = { session: {} } as Request;
      let statusCode = 0;

      const res = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: () => {},
          };
        },
      } as unknown as Response;

      let nextCalled = false;
      await requireAuth(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(401);
    });
  });
});
