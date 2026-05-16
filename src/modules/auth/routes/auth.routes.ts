// src/modules/auth/routes/auth.routes.ts
// Mount in app.ts: app.use("/auth", authRouter)

import { Router } from "express";

import { authenticate }       from "../middleware/authenticate";
import {
  refreshLimiter,
  changePasswordLimiter,
} from "../middleware/rateLimiter";
import {
  loginRateLimiter,
  registerRateLimiter,
} from "../../../middleware/rateLimiter.redis";
import {
  registerController,
  loginController,
  logoutController,
  refreshController,
  getMeController,
  changePasswordController,
} from "../controllers/auth.controller";

const router = Router();

// ── Public routes (no auth required) ──────────────────────────
router.post("/register",        registerRateLimiter, registerController);
router.post("/login",           loginRateLimiter,    loginController);
router.post("/refresh",         refreshLimiter,     refreshController);

// ── Protected routes (authenticate middleware required) ────────
router.post("/logout",          authenticate, logoutController);
router.get( "/me",              authenticate, getMeController);
router.post("/change-password", authenticate, changePasswordLimiter, changePasswordController);

export { router as authRouter };
