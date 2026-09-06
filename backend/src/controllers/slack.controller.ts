import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { exchangeSlackCodeForTokens, getSlackAuthUrl } from "../services/slackOAuth.service";
import {
  deleteSlackConnectionByUserId,
  findSlackConnectionByUserId,
  upsertSlackConnection,
} from "../models/slack.model";

export async function slackConnectHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const state = randomUUID();
    if (req.session) {
      req.session.slackOauthState = state;
    }

    const authUrl = getSlackAuthUrl(state);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
}

export async function slackCallbackHandler(
  req: Request,
  res: Response
): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const errorParam = req.query.error;

  const expectedState = req.session?.slackOauthState;
  if (req.session) {
    delete req.session.slackOauthState;
  }

  if (errorParam || !code) {
    console.warn("⚠️ Slack OAuth callback received error or missing code:", errorParam);
    res.redirect(`${env.FRONTEND_URL}/?slack_error=oauth_denied`);
    return;
  }

  if (!state || !expectedState || state !== expectedState) {
    console.warn("⚠️ Slack OAuth CSRF state mismatch or missing state");
    res.redirect(`${env.FRONTEND_URL}/?slack_error=invalid_state`);
    return;
  }

  if (!req.user?.id) {
    console.warn("⚠️ Unauthenticated attempt to complete Slack OAuth callback");
    res.redirect(`${env.FRONTEND_URL}/login?error=unauthorized`);
    return;
  }

  try {
    const tokens = await exchangeSlackCodeForTokens(code);

    await upsertSlackConnection({
      userId: req.user.id,
      teamId: tokens.team?.id || "unknown-team",
      teamName: tokens.team?.name || null,
      channelId: tokens.incoming_webhook?.channel_id || null,
      channelName: tokens.incoming_webhook?.channel || null,
      webhookUrl: tokens.incoming_webhook?.url || null,
      accessToken: tokens.access_token || "",
      botUserId: tokens.bot_user_id || null,
    });

    res.redirect(`${env.FRONTEND_URL}/?slack_success=true`);
  } catch (err) {
    console.error("❌ Slack OAuth exchange error:", err instanceof Error ? err.message : err);
    res.redirect(`${env.FRONTEND_URL}/?slack_error=oauth_failed`);
  }
}

export async function getSlackStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const conn = await findSlackConnectionByUserId(req.user.id);
    if (!conn) {
      res.json({ connected: false });
      return;
    }

    res.json({
      connected: true,
      teamName: conn.team_name ?? null,
      channel: conn.channel_name ?? null,
      createdAt: conn.created_at,
    });
  } catch (err) {
    next(err);
  }
}

export async function disconnectSlackHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await deleteSlackConnectionByUserId(req.user.id);
    res.json({ success: true, message: "Slack connection disconnected" });
  } catch (err) {
    next(err);
  }
}
