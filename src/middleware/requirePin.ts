import type { Request, Response, NextFunction } from "express";
import { AppError, TransactionPinRequiredError } from "../lib/errors";
import { verifyPin } from "../modules/security/services/transaction-pin.service";
import { writeAuditLog } from "../modules/auth/services/audit.service";
import { logger } from "../lib/logger";
import { getDbInstance } from "../db/knex";

const db = getDbInstance();

/**
 * Express middleware that verifies the user's transaction PIN OR a biometric
 * purchase confirmation before allowing a purchase to proceed.
 *
 * Standard PIN path:
 *   Expects `transaction_pin` in req.body.
 *   Error codes: TRANSACTION_PIN_REQUIRED, TRANSACTION_PIN_NOT_SET,
 *                TRANSACTION_PIN_LOCKED, INVALID_TRANSACTION_PIN
 *
 * Biometric path (when req.body.biometric_purchase === true):
 *   The client has already verified the user biometrically via device hardware.
 *   Server validates that biometric purchase is enabled for the user and that they
 *   have at least one registered biometric device (proving a trusted device exists).
 *   Error codes: BIOMETRIC_PURCHASE_NOT_ENABLED, BIOMETRIC_DEVICE_NOT_REGISTERED
 *
 * Fallback tracking:
 *   When req.body.biometric_fallback === true alongside a transaction_pin, the
 *   middleware logs biometric_purchase_fallback_to_pin so the audit trail captures
 *   when biometric failed and the user completed the purchase via PIN instead.
 */
export async function requirePin(
  req:  Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId            = req.user?.id ?? "unauthenticated";
  const pin               = req.body.transaction_pin as string | undefined;
  const biometricPurchase = req.body.biometric_purchase === true;
  const biometricFallback = req.body.biometric_fallback === true;

  logger.info("[PIN-CHECK]", {
    route:              `${req.method} ${req.path}`,
    user_id:            userId,
    pin_provided:       !!pin,
    biometric_purchase: biometricPurchase,
    biometric_fallback: biometricFallback,
  });

  try {
    // ── Biometric purchase path ──────────────────────────────────────────────
    if (biometricPurchase && !pin) {
      const user = await db("users")
        .where({ id: userId })
        .select("biometric_purchase_enabled")
        .first<{ biometric_purchase_enabled: boolean } | undefined>();

      if (!user?.biometric_purchase_enabled) {
        writeAuditLog(db, req, {
          actorId:      userId,
          action:       "biometric_purchase_failed",
          outcome:      "failure",
          resourceType: "transaction",
          errorMessage: "Biometric purchase not enabled",
        });
        throw new AppError(
          "Biometric purchase authorisation is not enabled. Please enable it in Settings → Security.",
          "BIOMETRIC_PURCHASE_NOT_ENABLED",
          422,
        );
      }

      const hasDevice = await db("biometric_devices")
        .where({ user_id: userId, is_active: true })
        .select("id")
        .first()
        .then(Boolean);

      if (!hasDevice) {
        writeAuditLog(db, req, {
          actorId:      userId,
          action:       "biometric_purchase_failed",
          outcome:      "failure",
          resourceType: "transaction",
          errorMessage: "No active biometric device",
        });
        throw new AppError(
          "No biometric device registered. Please set up biometric login in Settings first.",
          "BIOMETRIC_DEVICE_NOT_REGISTERED",
          422,
        );
      }

      writeAuditLog(db, req, {
        actorId:      userId,
        action:       "biometric_purchase_success",
        outcome:      "success",
        resourceType: "transaction",
      });
      logger.info("[PIN-CHECK] biometric purchase accepted", { user_id: userId, route: req.path });
      next();
      return;
    }

    // ── Standard PIN path ────────────────────────────────────────────────────
    if (!pin) {
      logger.warn("[PIN-CHECK] rejected — missing", { user_id: userId, route: req.path });
      throw new TransactionPinRequiredError();
    }

    await verifyPin(userId, pin);

    if (biometricFallback) {
      writeAuditLog(db, req, {
        actorId:      userId,
        action:       "biometric_purchase_fallback_to_pin",
        outcome:      "success",
        resourceType: "transaction",
        metadata:     { route: req.path },
      });
    }

    logger.info("[PIN-CHECK] passed", { user_id: userId, route: req.path });
    next();
  } catch (err) {
    const code = (err as { code?: string }).code ?? "UNKNOWN";
    if (code !== "TRANSACTION_PIN_REQUIRED") {
      logger.warn("[PIN-CHECK] rejected", { user_id: userId, route: req.path, code });
    }
    next(err);
  }
}
