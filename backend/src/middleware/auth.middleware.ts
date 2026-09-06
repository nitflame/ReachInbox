import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { findUserById } from "../models/user.model";

const redisSessionClient = {
  get: (key: string) => redis.get(key),
  set: (key: string, val: string, options?: { expiration?: { type: string; value: number } }) => {
    if (options?.expiration?.value) {
      return redis.set(key, val, "EX", options.expiration.value);
    }
    return redis.set(key, val);
  },
  expire: (key: string, ttl: number) => redis.expire(key, ttl),
  del: (keys: string[] | string) => redis.del(Array.isArray(keys) ? keys : [keys]),
  mGet: (keys: string[]) => redis.mget(keys),
  async *scanIterator(opts?: { MATCH?: string; COUNT?: number }) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        opts?.MATCH || "*",
        "COUNT",
        opts?.COUNT || 100
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        yield keys;
      }
    } while (cursor !== "0");
  },
};

let sessionStore: session.Store;
try {
  sessionStore = new RedisStore({ client: redisSessionClient as any });
} catch (err) {
  console.warn("⚠️ RedisStore initialization failed, falling back to MemoryStore:", err);
  sessionStore = new session.MemoryStore();
}

export const sessionMiddleware = session({
  store: sessionStore,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "reachinbox_sid",
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.session?.userId;

    if (userId) {
      const user = await findUserById(userId);
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          google_id: user.google_id,
        };
        return next();
      }
    }

    if (req.user) {
      return next();
    }

    res.status(401).json({ error: "Unauthorized" });
  } catch (err) {
    next(err);
  }
}
