// src/modules/auth/controllers/login-2fa.controller.ts
// POST /auth/2fa/verify-login
//
// Second step of the admin 2FA login flow:
//   client submits challenge_id (from step 1) + TOTP code or backup code.
//   On success: issues the real session and returns tokens identical to normal login.

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance }          from "../../../db/knex";
import { AppError }               from "../../../shared/errors/AppError";
import { getChallenge, consumeChallenge } from "../services/challenge.service";
import { resolveUserRbac }        from "../services/rbac.service";
import { createSession }          from "../services/session.service";
import { writeAuditLog }          from "../services/audit.service";
import { verifyTotpToken, hashBackupCode } from "../../../lib/totp";
import { getClientIp }            from "../../../middleware/rateLimiter.redis";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const COOKIE_BASE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path:     "/",
};

const VerifyLoginSchema = z.object({
  challenge_id: z.string().uuid("challenge_id must be a valid UUID"),
  totp_code: z
    .string()
    .min(6)
    .max(10)
    .regex(/^[\dA-Fa-f]+$/, "Must be a 6-digit TOTP or 10-character backup code"),
});

export async function verifyLoginTotpController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { challenge_id, totp_code } = VerifyLoginSchema.parse(req.body);
    const db = getDbInstance();

    // 1. Read challenge state (non-consuming — allows multiple TOTP retries).
    const challenge = await getChallenge(challenge_id);
    const { userId, email, supabaseAccessToken, supabaseRefreshToken, supabaseExpiresAt } = challenge;

    // 2. Load user's current TOTP state.
    const user = await db("users")
      .where({ id: userId })
      .select("totp_secret", "totp_enabled", "totp_backup_codes",
              "status", "kyc_level", "is_email_verified")
      .first();

    if (!user?.totp_enabled) {
      throw new AppError(400, "TOTP_NOT_ENABLED", "2FA is not enabled for this account.");
    }

    // 3. Verify TOTP code or backup code (single-use).
    const clean = totp_code.replace(/\s/g, "").toUpperCase();
    let valid = false;

    if (/^\d{6}$/.test(clean)) {
      valid = verifyTotpToken(user.totp_secret as string, clean);
    }

    if (!valid && user.totp_backup_codes) {
      const hashed = hashBackupCode(clean);
      const codes  = user.totp_backup_codes as string[];
      const idx    = codes.indexOf(hashed);
      if (idx >= 0) {
        valid = true;
        const remaining = [...codes];
        remaining.splice(idx, 1);
        await db("users").where({ id: userId }).update({ totp_backup_codes: remaining });
      }
    }

    if (!valid) {
      writeAuditLog(db, req, {
        actorId:      userId,
        action:       "2fa_login_failure",
        outcome:      "failure",
        resourceType: "session",
        errorMessage: "Invalid TOTP code",
      });
      throw new AppError(401, "TOTP_INVALID", "Invalid 2FA code. Please try again.");
    }

    // 4. Atomically consume the challenge (single-use).
    const consumed = await consumeChallenge(challenge_id);
    if (!consumed) {
      throw new AppError(400, "CHALLENGE_EXPIRED", "2FA session expired. Please sign in again.");
    }

    // 5. Build token pair from the Supabase session stored at challenge creation.
    const tokens = {
      access_token:             supabaseAccessToken,
      refresh_token:            supabaseRefreshToken,
      access_token_expires_at:  new Date(supabaseExpiresAt * 1000),
      refresh_token_expires_at: new Date(Date.now() + REFRESH_TTL_MS),
    };

    // 6. Resolve RBAC + create session.
    const rbac = await resolveUserRbac(db, userId);

    const ip = getClientIp(req);
    const sessionId = await createSession(db, {
      userId,
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      ipAddress:    ip !== "unknown" ? ip : null,
      userAgent:    (req.headers["user-agent"] as string | undefined) ?? null,
      expiresAt:    tokens.refresh_token_expires_at,
    });

    // 7. Mark login complete.
    await db("users").where({ id: userId }).update({
      last_login_at: new Date(),
      login_count:   db.raw("login_count + 1"),
    });

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "2fa_login_success",
      outcome:      "success",
      resourceType: "session",
      resourceId:   sessionId,
    });

    // 8. Set auth cookies if enabled.
    if (process.env.SECURE_COOKIES === "true") {
      res.cookie("access_token",  tokens.access_token,  { ...COOKIE_BASE, maxAge: 60 * 60 * 1000 });
      res.cookie("refresh_token", tokens.refresh_token, { ...COOKIE_BASE, maxAge: 30 * 24 * 60 * 60 * 1000 });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id:                userId,
          email,
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
  } catch (err) {
    next(err);
  }
}
