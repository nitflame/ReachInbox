import { Router } from "express";
import {
  getEmailAnalyticsHandler,
  getEmailHandler,
  reindexEmailsHandler,
  scheduleEmailsHandler,
  searchEmailsHandler,
} from "../controllers/emails.controller";

export const emailsRouter = Router();

emailsRouter.post("/schedule", scheduleEmailsHandler);
emailsRouter.get("/search", searchEmailsHandler);
emailsRouter.get("/analytics", getEmailAnalyticsHandler);
emailsRouter.post("/reindex", reindexEmailsHandler);
emailsRouter.get("/:id", getEmailHandler);
