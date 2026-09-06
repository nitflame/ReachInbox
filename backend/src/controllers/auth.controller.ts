import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import {
  exchangeCodeForTokens,
  fetchGoogleUserProfile,
  getGoogleAuthUrl,
} from "../services/googleOAuth.service";
import { findOrCreateUserByGoogleProfile, findOrCreateUserByEmail, findUserById } from "../models/user.model";

export async function googleAuthHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const state = randomUUID();
    if (req.session) {
      req.session.oauthState = state;
    }

    const authUrl = getGoogleAuthUrl(state);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
}

export async function googleCallbackHandler(
  req: Request,
  res: Response
): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const errorParam = req.query.error;

  const expectedState = req.session?.oauthState;
  if (req.session) {
    delete req.session.oauthState;
  }

  if (errorParam || !code) {
    console.warn("⚠️ Google OAuth callback received error or missing code:", errorParam);
    res.redirect(`${env.FRONTEND_URL}/login?error=oauth_denied`);
    return;
  }

  if (!state || !expectedState || state !== expectedState) {
    console.warn("⚠️ OAuth CSRF state mismatch or missing state");
    res.redirect(`${env.FRONTEND_URL}/login?error=invalid_state`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchGoogleUserProfile(tokens.access_token);

    if (!profile.sub || !profile.email) {
      console.warn("⚠️ Google profile missing sub or email");
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_profile`);
      return;
    }

    if (profile.email_verified === false) {
      console.warn(`⚠️ Google email ${profile.email} is not verified`);
      res.redirect(`${env.FRONTEND_URL}/login?error=unverified_email`);
      return;
    }

    const user = await findOrCreateUserByGoogleProfile({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name,
      avatar: profile.picture,
    });

    if (req.session) {
      req.session.userId = user.id;
      if (typeof req.session.save === "function") {
        req.session.save((err) => {
          if (err) {
            console.error("❌ Session save error in googleCallback:", err);
          }
          res.redirect(env.FRONTEND_URL);
        });
        return;
      }
      res.redirect(env.FRONTEND_URL);
      return;
    }

    res.redirect(env.FRONTEND_URL);
  } catch (err) {
    console.error("❌ Google OAuth exchange error:", err instanceof Error ? err.message : err);
    res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
  }
}

export async function devLoginHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (!env.ENABLE_DEV_AUTH) {
    res.status(403).json({ error: "Dev login is disabled (set ENABLE_DEV_AUTH=true to enable)" });
    return;
  }
  const email = (typeof req.query.email === "string" ? req.query.email : env.DEV_DEFAULT_USER_EMAIL).toLowerCase();
  const user = await findOrCreateUserByEmail(email);
  if (req.session) {
    req.session.userId = user.id;
    if (typeof req.session.save === "function") {
      req.session.save((err) => {
        if (err) {
          console.error("❌ Session save error in devLogin:", err);
        }
        res.redirect(env.FRONTEND_URL);
      });
      return;
    }
    res.redirect(env.FRONTEND_URL);
    return;
  }
  res.redirect(env.FRONTEND_URL);
}

export async function getMeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await findUserById(req.user.id);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      avatar: user.avatar ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Session destruction error:", err);
      }
      res.clearCookie("reachinbox_sid");
      res.json({ success: true, message: "Logged out" });
    });
  } else {
    res.clearCookie("reachinbox_sid");
    res.json({ success: true, message: "Logged out" });
  }
}
