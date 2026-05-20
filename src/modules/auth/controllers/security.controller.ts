import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";
import { AppError }       from "../../../shared/errors/AppError";
import { writeAuditLog }  from "../services/audit.service";
import { supabaseSignIn } from "../services/supabase.service";
import {
  generateTotpSecret,
  verifyTotpToken,
  getTotpUri,
  generateBackupCodes,
  hashBackupCode,
} from "../../../lib/totp";

const db = getDbInstance();

// ── GET /auth/security/status ─────────────────────────────────────────────────

export async function getSecurityStatusController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await db("users")
      .where({ id: req.user!.id })
      .select("totp_secret", "totp_enabled")
      .first();

    res.status(200).json({
      success: true,
      data: {
        totp_enabled:       !!user?.totp_enabled,
        totp_setup_pending: !!user?.totp_secret && !user?.totp_enabled,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /auth/security/totp/setup ────────────────────────────────────────────
// Generates a new secret (pending — not active until verified).
// Calling again while pending replaces the pending secret.

export async function setupTotpController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    const user = await db("users")
      .where({ id: userId })
      .select("email", "totp_enabled")
      .first();

    if (user?.totp_enabled) {
      throw new AppError(
        400, "TOTP_ALREADY_ENABLED",
        "2FA is already active. Disable it before re-setup."
      );
    }

    const secret      = generateTotpSecret();
    const backupCodes = generateBackupCodes(8);
    const uri         = getTotpUri(secret, user!.email as string);

    await db("users").where({ id: userId }).update({
      totp_secret:       secret,
      totp_enabled:      false,
      totp_backup_codes: backupCodes.map(hashBackupCode),
    });

    res.status(200).json({
      success: true,
      data: {
        secret,
        uri,
        backup_codes: backupCodes,
        instructions: "Open your authenticator app and add a new account using the secret key or the otpauth URI. Save the backup codes — they are shown only once.",
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /auth/security/totp/verify ──────────────────────────────────────────
// Confirms the setup by verifying the first live TOTP code.

const VerifySchema = z.object({
  totp_code: z
    .string()
    .regex(/^\d{6}$/, "totp_code must be exactly 6 digits"),
});

export async function verifyTotpSetupController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const { totp_code } = VerifySchema.parse(req.body);
    const userId = req.user!.id;

    const user = await db("users")
      .where({ id: userId })
      .select("totp_secret", "totp_enabled")
      .first();

    if (!user?.totp_secret) {
      throw new AppError(
        400, "TOTP_NOT_SETUP",
        "No pending 2FA setup. Call POST /auth/security/totp/setup first."
      );
    }
    if (user.totp_enabled) {
      throw new AppError(400, "TOTP_ALREADY_ENABLED", "2FA is already enabled.");
    }

    if (!verifyTotpToken(user.totp_secret as string, totp_code)) {
      throw new AppError(400, "TOTP_INVALID", "Invalid or expired code. Check your authenticator app and try again.");
    }

    await db("users").where({ id: userId }).update({ totp_enabled: true });

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "2fa_enabled",
      outcome:      "success",
      resourceType: "user",
      resourceId:   userId,
    });

    res.status(200).json({ success: true, data: { message: "Two-factor authentication has been enabled." } });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /auth/security/totp ────────────────────────────────────────────────
// Disables 2FA after verifying current password + a valid TOTP or backup code.

const DisableSchema = z.object({
  current_password: z.string().min(1, "current_password is required"),
  totp_code: z.string()
    .min(6)
    .max(10)
    .regex(/^[\dA-Fa-f]+$/, "totp_code must be a 6-digit TOTP or a 10-character backup code"),
});

export async function disableTotpController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const { current_password, totp_code } = DisableSchema.parse(req.body);
    const userId = req.user!.id;

    const user = await db("users")
      .where({ id: userId })
      .select("totp_secret", "totp_enabled", "totp_backup_codes", "email")
      .first();

    if (!user?.totp_enabled) {
      throw new AppError(400, "TOTP_NOT_ENABLED", "2FA is not currently enabled.");
    }

    // Verify current password before allowing 2FA removal
    try {
      await supabaseSignIn(user.email as string, current_password);
    } catch {
      throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }

    const clean = totp_code.replace(/\s/g, "").toUpperCase();
    let valid = false;

    // Try as 6-digit TOTP code
    if (/^\d{6}$/.test(clean)) {
      valid = verifyTotpToken(user.totp_secret as string, clean);
    }

    // Try as 10-char backup code
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
      throw new AppError(400, "TOTP_INVALID", "Invalid TOTP code or backup code.");
    }

    await db("users").where({ id: userId }).update({
      totp_secret:       null,
      totp_enabled:      false,
      totp_backup_codes: null,
    });

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "2fa_disabled",
      outcome:      "success",
      resourceType: "user",
      resourceId:   userId,
    });

    res.status(200).json({ success: true, data: { message: "Two-factor authentication has been disabled." } });
  } catch (err) {
    next(err);
  }
}
