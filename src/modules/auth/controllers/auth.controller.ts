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
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../validators/auth.validators";
import {
  register,
  login,
  logout,
  refreshTokens,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
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
          id:                  user.id,
          email:               user.email,
          status:              user.status,
          kyc_level:           user.kyc_level,
          is_email_verified:   user.is_email_verified,
          roles:               rbac.roles,
          permissions:         rbac.permissions,
          has_transaction_pin: false,
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
          id:                  user.id,
          email:               user.email,
          status:              user.status,
          kyc_level:           user.kyc_level,
          is_email_verified:   user.is_email_verified,
          roles:               rbac.roles,
          permissions:         rbac.permissions,
          has_transaction_pin: user.has_transaction_pin,
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
        last_login_at:        data.last_login_at,
        created_at:           data.created_at,
        profile:              data.profile,
        roles:                data.roles,
        permissions:          data.permissions,
        has_transaction_pin:  data.has_transaction_pin,
      },
    });
  } catch (err) { next(err); }
}

// ── PATCH /auth/profile ────────────────────────────────────────

// Normalise any Nigerian or international phone number to E.164.
// Returns null for blank input, throws AppError for unrecognised formats.
function normalisePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;             // already E.164
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return `+234${digits.slice(1)}`;  // 080…
  if (digits.length === 13 && digits.startsWith("234")) return `+${digits}`;             // 234…
  throw new AppError(
    422, "INVALID_PHONE",
    "Phone must be in Nigerian format (08012345678) or international E.164 format (+2348012345678)",
  );
}

export async function updateProfileController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

    const { first_name, last_name, phone, username, date_of_birth } = req.body as Record<string, string>;
    const { randomUUID } = await import("crypto");
    const db = getDbInstance();

    // Fields that live on the users table
    const usersUpdate: Record<string, string | null> = {};
    if (phone !== undefined) {
      // Normalise to E.164 — "09061615797" → "+2349061615797"
      // Throws 422 AppError for invalid formats that can't be normalised.
      usersUpdate.phone = normalisePhoneE164(String(phone));
    }
    if (username !== undefined) {
      // The users_username_fmt constraint requires lowercase [a-z0-9_]{3,30}.
      // Convert silently so the UI can submit mixed-case values without 500s.
      const lower = String(username).trim().toLowerCase() || null;
      if (lower && !/^[a-z0-9_]{3,30}$/.test(lower)) {
        throw new AppError(
          422, "INVALID_USERNAME",
          "Username must be 3–30 characters and contain only letters, numbers and underscores",
        );
      }
      usersUpdate.username = lower;
    }

    // Fields that live on user_profiles
    const profileUpdate: Record<string, string | null> = {};
    if (first_name !== undefined) profileUpdate.first_name = String(first_name).trim() || null;
    if (last_name  !== undefined) profileUpdate.last_name  = String(last_name).trim()  || null;
    if (date_of_birth !== undefined) {
      const dob = String(date_of_birth).trim();
      if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        throw new AppError(422, "INVALID_DOB", "Date of birth must be in YYYY-MM-DD format");
      }
      profileUpdate.date_of_birth = dob || null;
    }

    if (Object.keys(usersUpdate).length === 0 && Object.keys(profileUpdate).length === 0) {
      res.status(400).json({ success: false, error: "No fields to update" });
      return;
    }

    if (Object.keys(usersUpdate).length > 0) {
      await db("users").where({ id: req.user.id }).update({ ...usersUpdate, updated_at: new Date() });
    }

    if (Object.keys(profileUpdate).length > 0) {
      const exists = await db("user_profiles").where({ user_id: req.user.id }).first();
      if (exists) {
        await db("user_profiles").where({ user_id: req.user.id }).update({ ...profileUpdate, updated_at: new Date() });
      } else {
        await db("user_profiles").insert({
          id: randomUUID(), user_id: req.user.id,
          ...profileUpdate, created_at: new Date(), updated_at: new Date(),
        });
      }
    }

    const updated = await db("users")
      .leftJoin("user_profiles as p", "p.user_id", "users.id")
      .where("users.id", req.user.id)
      .select(
        "users.id", "users.email", "users.phone", "users.username",
        "users.status", "users.kyc_level", "users.is_email_verified",
        "users.referral_code", "users.created_at",
        "p.first_name", "p.last_name", "p.date_of_birth",
      )
      .first();

    res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
}

// ── POST /auth/forgot-password ───────────────────────────────────────────────

export async function forgotPasswordController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { email } = ForgotPasswordSchema.parse(req.body);

    // forgotPassword is fire-and-forget internally — it swallows Supabase errors
    // so the caller can never tell whether the email existed.
    await forgotPassword(email);

    // Always return the same generic message (prevents user enumeration).
    res.status(200).json({
      success: true,
      message: "If an account exists for this email, a password reset link has been sent.",
    });
  } catch (err) {
    // Only Zod validation errors (invalid email format) propagate here.
    next(err);
  }
}

// ── POST /auth/reset-password ─────────────────────────────────────────────────

export async function resetPasswordController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { access_token, password } = ResetPasswordSchema.parse(req.body);

    // access_token and password are NOT spread into any log statement.
    await resetPassword(access_token, password);

    res.status(200).json({
      success: true,
      message: "Password updated successfully. Please log in with your new password.",
    });
  } catch (err) {
    next(err);
  }
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
