import { Router } from "express";
import {
  disconnectSlackHandler,
  getSlackStatusHandler,
  slackCallbackHandler,
  slackConnectHandler,
} from "../controllers/slack.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const slackRouter = Router();

slackRouter.get("/connect", requireAuth, slackConnectHandler);
slackRouter.get("/callback", requireAuth, slackCallbackHandler);
slackRouter.get("/status", requireAuth, getSlackStatusHandler);
slackRouter.post("/disconnect", requireAuth, disconnectSlackHandler);
