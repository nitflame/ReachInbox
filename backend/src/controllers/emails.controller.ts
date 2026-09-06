import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { scheduleEmailsSchema } from "../validation/email.schema";
import { scheduleEmails } from "../services/emailScheduler.service";
import { findEmailByIdForUser } from "../models/email.model";
import { toApiEmail } from "../utils/mapEmail";
import { reindexAllEmailsFromDb, searchEmails } from "../services/elasticsearch.service";
import { getEmailAnalytics } from "../models/analytics.model";

export async function scheduleEmailsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = scheduleEmailsSchema.parse(req.body);

    // Standard REST idempotency pattern: a request-scoped header takes
    // precedence over a body field, so proxies/clients that only support
    // header-based idempotency keys still work.
    const idempotencyKey = req.header("Idempotency-Key")?.trim() || body.idempotencyKey;

    const result = await scheduleEmails({
      user: req.user!,
      sender: body.sender,
      recipient: body.recipient,
      recipients: body.recipients,
      subject: body.subject,
      body: body.body,
      startTime: body.startTime,
      delayBetweenEmailsMs: body.delayBetweenEmailsMs,
      hourlyLimit: body.hourlyLimit,
      idempotencyKey,
    });

    res.status(201).json({
      idempotencyKey: result.idempotencyKey,
      startTime: result.startTime,
      pacing: result.pacing,
      emails: result.emails,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "ValidationError", details: err.flatten() });
      return;
    }
    next(err);
  }
}

export async function getEmailHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const email = await findEmailByIdForUser(req.params.id, req.user!.id);
    if (!email) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.json(toApiEmail(email));
  } catch (err) {
    next(err);
  }
}

export async function searchEmailsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const queryStr = typeof req.query.q === "string" ? req.query.q : undefined;
    const statusStr = typeof req.query.status === "string" ? req.query.status : undefined;
    const pageNum = typeof req.query.page === "string" ? parseInt(req.query.page, 10) : undefined;
    const limitNum = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;

    const result = await searchEmails(userId, {
      query: queryStr,
      status: statusStr,
      page: pageNum,
      limit: limitNum,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function reindexEmailsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await reindexAllEmailsFromDb();
    res.json({
      success: true,
      message: `Successfully reindexed ${result.indexedCount} emails into Elasticsearch`,
      indexedCount: result.indexedCount,
    });
  } catch (err) {
    next(err);
  }
}

export async function getEmailAnalyticsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const range = typeof req.query.range === "string" ? req.query.range : "7d";
    const analytics = await getEmailAnalytics(userId, range);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
}

