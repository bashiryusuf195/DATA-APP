// src/modules/auth/controllers/auth.controller.ts
// Thin HTTP adapter — all business logic lives in auth.service.ts.

import { getDbInstance } from "../../../db/knex";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../../shared/errors/AppError";
import { failedLoginLimiter, getClientIp } from "../../../middleware/rateLimiter.redis";
import { validateOrThrow }                       from "../middleware/validate";
import {
  RegisterSchema,
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  ChangePasswordSchema,
} from "../validators/auth.validators";
import {
  register,
  login,
  logout,
  refreshTokens,
  getMe,
  changePassword,
} from "../services/auth.service";

// ── Cookie helpers ─────────────────────────────────────────────

const COOKIE_BASE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path:     "/",
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  if (process.env.SECURE_COOKIES !== "true") return;
  res.cookie("access_token",  accessToken,  { ...COOKIE_BASE, maxAge: 60 * 60 * 1000 });
  res.cookie("refresh_token", refreshToken, { ...COOKIE_BASE, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie("access_token",  COOKIE_BASE);
  res.clearCookie("refresh_token", COOKIE_BASE);
}

// ── POST /auth/register ────────────────────────────────────────

export async function registerController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const input = validateOrThrow(RegisterSchema, req.body);
    const db    = getDbInstance();

    const { user, tokens, sessionId, rbac } = await register(db, req, input);
    setAuthCookies(res, tokens.access_token, tokens.refresh_token);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id:                user.id,
          email:             user.email,
          status:            user.status,
          kyc_level:         user.kyc_level,
          is_email_verified: user.is_email_verified,
          roles:             rbac.roles,
          permissions:       rbac.permissions,
        },
        tokens: {
          access_token:             tokens.access_token,
          refresh_token:            tokens.refresh_token,
          access_token_expires_at:  tokens.access_token_expires_at,
          refresh_token_expires_at: tokens.refresh_token_expires_at,
        },
        session_id: sessionId,
      },
    });
  } catch (err) { next(err); }
}

// Returns true for wrong-credential errors that should increment the
// failed-login counter. Other errors (DB down, account suspended, etc.)
// should NOT burn a brute-force slot.
function isCredentialError(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "INVALID_CREDENTIALS"
  );
}

// ── POST /auth/login ───────────────────────────────────────────

export async function loginController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const input = validateOrThrow(LoginSchema, req.body);
    const ip    = getClientIp(req);
    const email = input.email;

    // ── Failed-login gate ──────────────────────────────────────
    // Checked BEFORE the DB round-trip. Only wrong-password attempts
    // increment this counter (see below), so a successful login never
    // burns a brute-force slot and resets the counter entirely.
    const { blocked, retryAfterSec } = await failedLoginLimiter.check(email, ip);
    if (blocked) {
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        success:    false,
        code:       "RATE_LIMIT_EXCEEDED",
        message:    `Too many failed login attempts. Try again in ${retryAfterSec} second${retryAfterSec === 1 ? "" : "s"}.`,
        retryAfter: retryAfterSec,
      });
      return;
    }

    const db = getDbInstance();

    let loginResult: Awaited<ReturnType<typeof login>>;
    try {
      loginResult = await login(db, req, {
        ...input,
        remember_me: input.remember_me ?? false,
      });
    } catch (loginErr) {
      if (isCredentialError(loginErr)) {
        await failedLoginLimiter.increment(email, ip);
      }
      throw loginErr;
    }

    // Successful password verification — clear failed-login counter.
    await failedLoginLimiter.reset(email, ip);

    // 2FA required for admin users with TOTP enabled.
    if (loginResult.requires_2fa) {
      res.status(200).json({
        success: true,
        data: { requires_2fa: true, challenge_id: loginResult.challenge_id },
      });
      return;
    }

    const { user, tokens, sessionId, rbac } = loginResult;
    setAuthCookies(res, tokens.access_token, tokens.refresh_token);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id:                user.id,
          email:             user.email,
          status:            user.status,
          kyc_level:         user.kyc_level,
          is_email_verified: user.is_email_verified,
          roles:             rbac.roles,
          permissions:       rbac.permissions,
        },
        tokens: {
          access_token:             tokens.access_token,
          refresh_token:            tokens.refresh_token,
          access_token_expires_at:  tokens.access_token_expires_at,
          refresh_token_expires_at: tokens.refresh_token_expires_at,
        },
        session_id: sessionId,
      },
    });
  } catch (err) { next(err); }
}

// ── POST /auth/logout ──────────────────────────────────────────

export async function logoutController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const input      = validateOrThrow(LogoutSchema, req.body);
    const rawToken   = (req.headers.authorization as string).slice(7);
    const db         = getDbInstance();

    await logout(db, req, req.user.id, req.sessionId, input.all_devices ?? false, rawToken);
    clearAuthCookies(res);

    res.status(204).end();
  } catch (err) { next(err); }
}

// ── POST /auth/refresh ─────────────────────────────────────────

export async function refreshController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const body        = validateOrThrow(RefreshSchema, req.body);
    const cookieToken = req.cookies?.refresh_token as string | undefined;
    const rawToken    = body.refresh_token ?? cookieToken;

    if (!rawToken) {
      throw new AppError(400, "BAD_REQUEST", "refresh_token is required");
    }

    const db                 = getDbInstance();
    const { tokens, sessionId } = await refreshTokens(db, req, rawToken);
    setAuthCookies(res, tokens.access_token, tokens.refresh_token);

    res.status(200).json({
      success: true,
      data: {
        tokens: {
          access_token:             tokens.access_token,
          refresh_token:            tokens.refresh_token,
          access_token_expires_at:  tokens.access_token_expires_at,
          refresh_token_expires_at: tokens.refresh_token_expires_at,
        },
        session_id: sessionId,
      },
    });
  } catch (err) { next(err); }
}

// ── GET /auth/me ───────────────────────────────────────────────

export async function getMeController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const db   = getDbInstance();
    const data = await getMe(db, req.user.id);

    res.status(200).json({
      success: true,
      data: {
        id:                data.id,
        auth_id:           data.auth_id,
        email:             data.email,
        phone:             data.phone,
        username:          data.username,
        status:            data.status,
        kyc_level:         data.kyc_level,
        is_email_verified: data.is_email_verified,
        is_phone_verified: data.is_phone_verified,
        last_login_at:     data.last_login_at,
        created_at:        data.created_at,
        profile:           data.profile,
        roles:             data.roles,
        permissions:       data.permissions,
      },
    });
  } catch (err) { next(err); }
}

// ── POST /auth/change-password ────────────────────────────────

export async function changePasswordController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const input = validateOrThrow(ChangePasswordSchema, req.body);
    const db    = getDbInstance();

    await changePassword(db, req, req.user.id, input);
    clearAuthCookies(res);

    res.status(200).json({
      success: true,
      data: { message: "Password changed. Please log in again on all devices." },
    });
  } catch (err) { next(err); }
}
