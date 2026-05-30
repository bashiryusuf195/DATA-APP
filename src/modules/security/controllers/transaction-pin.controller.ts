import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";
import { AppError }       from "../../../shared/errors/AppError";
import { writeAuditLog }  from "../../auth/services/audit.service";
import { supabaseSignIn } from "../../auth/services/supabase.service";
import {
  isWeakPin,
  persistPin,
  removePin,
  verifyPin,
  hasPinSet,
  storeResetToken,
  consumeResetToken,
} from "../services/transaction-pin.service";

const db = getDbInstance();

// ── Shared pin field validator ────────────────────────────────────────────────
// Accepts exactly 4 or 6 numeric digits.
const pinField = z
  .string()
  .regex(/^\d{4}$|^\d{6}$/, "PIN must be exactly 4 or 6 digits");

// ── GET /security/transaction-pin/status ─────────────────────────────────────
export async function pinStatusController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const row = await db("users")
      .where({ id: req.user!.id })
      .select(
        "transaction_pin_set_at",
        "transaction_pin_failed_attempts",
        "transaction_pin_locked_until",
        db.raw("transaction_pin_hash IS NOT NULL AS pin_set"),
      )
      .first() as {
        pin_set:                         boolean;
        transaction_pin_set_at:          string | null;
        transaction_pin_failed_attempts: number;
        transaction_pin_locked_until:    string | null;
      } | undefined;

    const lockedUntilMs = row?.transaction_pin_locked_until
      ? new Date(row.transaction_pin_locked_until).getTime()
      : null;
    const isLocked = lockedUntilMs !== null && lockedUntilMs > Date.now();

    res.status(200).json({
      success: true,
      data: {
        pin_set:               !!row?.pin_set,
        pin_set_at:            row?.transaction_pin_set_at ?? null,
        failed_attempts:       row?.transaction_pin_failed_attempts ?? 0,
        locked:                isLocked,
        locked_until:          isLocked ? row!.transaction_pin_locked_until : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /security/transaction-pin/setup ─────────────────────────────────────
const SetupSchema = z.object({
  pin: pinField,
});

export async function setupPinController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { pin } = SetupSchema.parse(req.body);
    const userId  = req.user!.id;

    if (await hasPinSet(userId)) {
      throw new AppError(
        409, "TRANSACTION_PIN_ALREADY_SET",
        "A transaction PIN is already set. Use POST /change to update it.",
      );
    }

    if (isWeakPin(pin)) {
      throw new AppError(
        400, "WEAK_TRANSACTION_PIN",
        "This PIN is too easy to guess. Choose a less predictable combination.",
      );
    }

    await persistPin(userId, pin);

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "transaction_pin_set",
      outcome:      "success",
      resourceType: "user",
      resourceId:   userId,
    });

    res.status(200).json({
      success: true,
      data: { message: "Transaction PIN set successfully." },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /security/transaction-pin/verify ────────────────────────────────────
const VerifySchema = z.object({
  transaction_pin: pinField,
});

export async function verifyPinController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { transaction_pin } = VerifySchema.parse(req.body);
    await verifyPin(req.user!.id, transaction_pin);
    res.status(200).json({ success: true, data: { valid: true } });
  } catch (err) {
    next(err);
  }
}

// ── POST /security/transaction-pin/change ────────────────────────────────────
const ChangeSchema = z.object({
  current_pin: pinField,
  new_pin:     pinField,
});

export async function changePinController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { current_pin, new_pin } = ChangeSchema.parse(req.body);
    const userId = req.user!.id;

    // Verifies current PIN (throws on wrong/locked/not-set)
    await verifyPin(userId, current_pin);

    if (current_pin === new_pin) {
      throw new AppError(400, "SAME_TRANSACTION_PIN", "New PIN must be different from the current PIN.");
    }

    if (isWeakPin(new_pin)) {
      throw new AppError(
        400, "WEAK_TRANSACTION_PIN",
        "This PIN is too easy to guess. Choose a less predictable combination.",
      );
    }

    await persistPin(userId, new_pin);

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "transaction_pin_changed",
      outcome:      "success",
      resourceType: "user",
      resourceId:   userId,
    });

    res.status(200).json({
      success: true,
      data: { message: "Transaction PIN updated successfully." },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /security/transaction-pin/reset/request ─────────────────────────────
const ResetRequestSchema = z.object({
  current_password: z.string().min(1, "current_password is required"),
});

export async function resetPinRequestController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { current_password } = ResetRequestSchema.parse(req.body);
    const userId = req.user!.id;

    const user = await db("users")
      .where({ id: userId })
      .select("email", db.raw("transaction_pin_hash IS NOT NULL AS pin_set"))
      .first() as { email: string; pin_set: boolean } | undefined;

    if (!user?.pin_set) {
      throw new AppError(400, "TRANSACTION_PIN_NOT_SET", "No transaction PIN is configured on this account.");
    }

    try {
      await supabaseSignIn(user.email, current_password);
    } catch {
      throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }

    const token = await storeResetToken(userId);

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "transaction_pin_reset",
      outcome:      "success",
      resourceType: "user",
      resourceId:   userId,
      metadata:     { step: "request" },
    });

    res.status(200).json({
      success: true,
      data: {
        message: "Reset token generated. In production this would be sent to your registered email.",
        // Returned directly to support testing. Remove the in-app return and send via email in production.
        reset_token: token,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /security/transaction-pin/reset/confirm ─────────────────────────────
const ResetConfirmSchema = z.object({
  reset_token: z.string().regex(/^\d{6}$/, "reset_token must be a 6-digit code"),
  new_pin:     pinField,
});

export async function resetPinConfirmController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reset_token, new_pin } = ResetConfirmSchema.parse(req.body);
    const userId = req.user!.id;

    try {
      await consumeResetToken(userId, reset_token);
    } catch {
      throw new AppError(400, "INVALID_RESET_TOKEN", "Reset token is invalid or has expired.");
    }

    if (isWeakPin(new_pin)) {
      throw new AppError(
        400, "WEAK_TRANSACTION_PIN",
        "This PIN is too easy to guess. Choose a less predictable combination.",
      );
    }

    await persistPin(userId, new_pin);

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "transaction_pin_reset",
      outcome:      "success",
      resourceType: "user",
      resourceId:   userId,
      metadata:     { step: "confirm" },
    });

    res.status(200).json({
      success: true,
      data: { message: "Transaction PIN has been reset successfully." },
    });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /security/transaction-pin ─────────────────────────────────────────
const RemoveSchema = z.object({
  current_pin:      pinField,
  current_password: z.string().min(1, "current_password is required"),
});

export async function removePinController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { current_pin, current_password } = RemoveSchema.parse(req.body);
    const userId = req.user!.id;

    // Require both PIN and password to remove a PIN (prevents bypass via stolen session)
    await verifyPin(userId, current_pin);

    const user = await db("users")
      .where({ id: userId })
      .select("email")
      .first() as { email: string } | undefined;

    try {
      await supabaseSignIn(user!.email, current_password);
    } catch {
      throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }

    await removePin(userId);

    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "transaction_pin_removed",
      outcome:      "success",
      resourceType: "user",
      resourceId:   userId,
    });

    res.status(200).json({
      success: true,
      data: { message: "Transaction PIN removed. Purchases will be rejected until a new PIN is set." },
    });
  } catch (err) {
    next(err);
  }
}
