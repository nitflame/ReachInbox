import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { findOrCreateUserByEmail } from "../models/user.model";

/**
 * TEMPORARY authentication stand-in.
 *
 * There is no real login yet. Callers may identify themselves with an
 * `X-Dev-User-Email` header; anything else falls back to a single shared
 * dev user (DEV_DEFAULT_USER_EMAIL). The user is found-or-created in the
 * `users` table and attached to `req.user`.
 *
 * This is deliberately isolated to one file and one header so it's a
 * single, obvious thing to delete when real (Google OAuth) auth lands -
 * every downstream handler only ever reads `req.user`, never this header.
 * Do NOT use this pattern in production: anyone can claim to be any tenant
 * simply by setting the header.
 */
export async function devAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // Production protected routes MUST use real session authentication.
  // In dev/test, devAuthMiddleware only runs if ENABLE_DEV_AUTH is explicitly configured.
  if (!env.ENABLE_DEV_AUTH) {
    return next();
  }

  // If a valid session user is already active, respect it and skip header override
  if (req.session?.userId) {
    return next();
  }

  try {
    const headerEmail = req.header("X-Dev-User-Email");
    if (!headerEmail?.trim()) {
      return next();
    }

    const email = headerEmail.trim().toLowerCase();

    const user = await findOrCreateUserByEmail(email);
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      google_id: user.google_id,
    };
    next();
  } catch (err) {
    next(err);
  }
}
