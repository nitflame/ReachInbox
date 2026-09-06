import "express";
import "express-session";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string | null;
        avatar?: string | null;
        google_id?: string | null;
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    slackOauthState?: string;
  }
}

export {};
