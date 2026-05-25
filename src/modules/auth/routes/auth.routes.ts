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
  updateProfileController,
} from "../controllers/auth.controller";
import {
  getSecurityStatusController,
  setupTotpController,
  verifyTotpSetupController,
  disableTotpController,
} from "../controllers/security.controller";
import { verifyLoginTotpController } from "../controllers/login-2fa.controller";
import { twoFactorVerifyLimiter } from "../../../middleware/rateLimiter.redis";

const router = Router();

// ── Public routes (no auth required) ──────────────────────────
router.post("/register",        registerRateLimiter, registerController);
router.post("/login",           loginRateLimiter,    loginController);
router.post("/refresh",         refreshLimiter,     refreshController);

// ── Protected routes (authenticate middleware required) ────────
router.post( "/logout",          authenticate, logoutController);
router.get(  "/me",              authenticate, getMeController);
router.patch("/profile",         authenticate, updateProfileController);
router.post( "/change-password", authenticate, changePasswordLimiter, changePasswordController);

// ── 2FA login verification (public — uses challenge token, no session) ────────
router.post("/2fa/verify-login", twoFactorVerifyLimiter, verifyLoginTotpController);

// ── Account security (2FA) ─────────────────────────────────────
router.get(   "/security/status",       authenticate, getSecurityStatusController);
router.post(  "/security/totp/setup",   authenticate, setupTotpController);
router.post(  "/security/totp/verify",  authenticate, verifyTotpSetupController);
router.delete("/security/totp",         authenticate, disableTotpController);

export { router as authRouter };
