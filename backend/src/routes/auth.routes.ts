import { Router } from "express";
import {
  googleAuthHandler,
  googleCallbackHandler,
  getMeHandler,
  logoutHandler,
  devLoginHandler,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const authRouter = Router();

authRouter.get("/google", googleAuthHandler);
authRouter.get("/google/callback", googleCallbackHandler);
authRouter.get("/dev-login", devLoginHandler);
authRouter.post("/dev-login", devLoginHandler);
authRouter.get("/me", requireAuth, getMeHandler);
authRouter.post("/logout", logoutHandler);
