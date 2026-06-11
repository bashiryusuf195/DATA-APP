// src/modules/auth/routes/auth.routes.ts
// Mount in app.ts: app.use("/auth", authRouter)

import { Router } from "express";

import { authenticate }       from "../middleware/authenticate";
import {
  refreshLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  changePasswordLimiter,
  passkeyAuthBeginLimiter,
  passkeyAuthCompleteLimiter,
  biometricRegisterLimiter,
  biometricLoginLimiter,
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
  forgotPasswordController,
  resetPasswordController,
  updatePreferencesController,
} from "../controllers/auth.controller";
import {
  getSecurityStatusController,
  setupTotpController,
  verifyTotpSetupController,
  disableTotpController,
} from "../controllers/security.controller";
import {
  beginRegistrationController,
  completeRegistrationController,
  beginAuthenticationController,
  completeAuthenticationController,
  listPasskeysController,
  deletePasskeyController,
} from "../controllers/passkey.controller";
import { verifyLoginTotpController } from "../controllers/login-2fa.controller";
import { twoFactorVerifyLimiter } from "../../../middleware/rateLimiter.redis";
import {
  registerBiometricDeviceController,
  biometricLoginController,
  listBiometricDevicesController,
  revokeBiometricDeviceController,
} from "../controllers/biometric-device.controller";

const router = Router();

// ── Public routes (no auth required) ──────────────────────────
router.post("/register",         registerRateLimiter,   registerController);
router.post("/login",            loginRateLimiter,      loginController);
router.post("/refresh",          refreshLimiter,        refreshController);
router.post("/forgot-password",  forgotPasswordLimiter, forgotPasswordController);
router.post("/reset-password",   resetPasswordLimiter,  resetPasswordController);

// ── Protected routes (authenticate middleware required) ────────
router.post( "/logout",          authenticate, logoutController);
router.get(  "/me",              authenticate, getMeController);
router.patch("/profile",         authenticate, updateProfileController);
router.post(  "/change-password", authenticate, changePasswordLimiter, changePasswordController);
router.patch( "/preferences",     authenticate, updatePreferencesController);

// ── 2FA login verification (public — uses challenge token, no session) ────────
router.post("/2fa/verify-login", twoFactorVerifyLimiter, verifyLoginTotpController);

// ── Account security (2FA) ─────────────────────────────────────
router.get(   "/security/status",       authenticate, getSecurityStatusController);
router.post(  "/security/totp/setup",   authenticate, setupTotpController);
router.post(  "/security/totp/verify",  authenticate, verifyTotpSetupController);
router.delete("/security/totp",         authenticate, disableTotpController);

// ── Passkeys (WebAuthn) ────────────────────────────────────────
// Registration (requires existing session — passkeys bind to real accounts)
router.post("/passkey/register/begin",    authenticate, beginRegistrationController);
router.post("/passkey/register/complete", authenticate, completeRegistrationController);

// Authentication (public — no session exists yet)
router.post("/passkey/auth/begin",    passkeyAuthBeginLimiter,    beginAuthenticationController);
router.post("/passkey/auth/complete", passkeyAuthCompleteLimiter, completeAuthenticationController);

// Device management
router.get(   "/passkey",     authenticate, listPasskeysController);
router.delete("/passkey/:id", authenticate, deletePasskeyController);

// ── Biometric device login (device_secret-based, long-lived) ──────────────────
// Registration requires an active session (user must be logged in to enable).
// Login is public — the device_secret proves possession without a session.
router.post(  "/biometric/register",       authenticate, biometricRegisterLimiter, registerBiometricDeviceController);
router.post(  "/biometric/login",          biometricLoginLimiter,                  biometricLoginController);
router.get(   "/biometric/devices",        authenticate,                            listBiometricDevicesController);
router.delete("/biometric/devices/:id",    authenticate,                            revokeBiometricDeviceController);

export { router as authRouter };
