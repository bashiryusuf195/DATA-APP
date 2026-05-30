import type { Request, Response, NextFunction } from "express";
import { TransactionPinRequiredError } from "../lib/errors";
import { verifyPin } from "../modules/security/services/transaction-pin.service";
import { logger } from "../lib/logger";

/**
 * Express middleware that verifies the user's transaction PIN before allowing
 * a purchase or wallet transfer to proceed.
 *
 * Expects `transaction_pin` in req.body (validated by the Zod purchase schema
 * before this middleware runs).
 *
 * Error codes emitted:
 *   TRANSACTION_PIN_REQUIRED   — field missing from body
 *   TRANSACTION_PIN_NOT_SET    — user has no PIN configured
 *   TRANSACTION_PIN_LOCKED     — too many wrong attempts
 *   INVALID_TRANSACTION_PIN    — wrong PIN
 */
export async function requirePin(
  req:  Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId      = req.user?.id ?? "unauthenticated";
  const pin         = req.body.transaction_pin as string | undefined;
  const pinProvided = !!pin;

  logger.info("[PIN-CHECK]", {
    route:        `${req.method} ${req.path}`,
    user_id:      userId,
    pin_provided: pinProvided,
  });

  try {
    if (!pin) {
      logger.warn("[PIN-CHECK] rejected — missing", { user_id: userId, route: req.path });
      throw new TransactionPinRequiredError();
    }
    await verifyPin(userId, pin);
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
