import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { logger } from "../lib/logger";
import { getClientIp } from "./rateLimiter.redis";

// ── Config ────────────────────────────────────────────────────────────────────

const DEDUP_TTL_SECONDS = 30;

// ── Fingerprint extraction ────────────────────────────────────────────────────
// Extracts a stable key from the request body that uniquely identifies "this
// purchase" regardless of idempotency key.
//
// Priority for recipient: phone → meter_number → smartcard_number → iuc_number
// Priority for unique key:  variation_code → amount → biller_code

function extractFingerprint(body: Record<string, unknown>): {
  recipient: string;
  uniqueKey: string;
} {
  const recipient = String(
    body.phone          ??
    body.meter_number   ??
    body.smartcard_number ??
    body.iuc_number     ??
    "",
  ).replace(/\s/g, "").toLowerCase();

  const uniqueKey = String(
    body.variation_code ??
    body.amount         ??
    body.biller_code    ??
    "",
  ).replace(/\s/g, "").toLowerCase();

  return { recipient, uniqueKey };
}

// ── Key builder ───────────────────────────────────────────────────────────────

function buildDedupKey(
  userId:      string,
  serviceType: string,
  recipient:   string,
  uniqueKey:   string,
): string {
  return `dedup:${userId}:${serviceType}:${recipient}:${uniqueKey}`;
}

// Mask all but last 4 characters for logging (no full phone/meter in logs).
function maskValue(v: string): string {
  if (v.length <= 4) return "****";
  return "*".repeat(v.length - 4) + v.slice(-4);
}

// ── Middleware factory ────────────────────────────────────────────────────────
// Usage: duplicatePurchaseGuard("airtime")
//
// Must be placed AFTER the idempotency middleware so that idempotency replays
// get their cached response before reaching this guard.
// Must be placed AFTER authenticate so req.user.id is available.

export function duplicatePurchaseGuard(serviceType: string) {
  return async (
    req:  Request,
    res:  Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      // Shouldn't happen — authenticate runs first — but fail open.
      next();
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const { recipient, uniqueKey } = extractFingerprint(body);

    // If we can't fingerprint the request, let it through.
    if (!recipient && !uniqueKey) {
      next();
      return;
    }

    const key = buildDedupKey(userId, serviceType, recipient, uniqueKey);

    try {
      // SET NX EX atomically: returns "OK" if the key was newly set,
      // or null if it already existed (= duplicate within TTL window).
      const result = await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS, "NX");

      if (result === null) {
        logger.warn("duplicate_purchase_blocked", {
          user_id:      userId,
          service_type: serviceType,
          recipient:    maskValue(recipient || uniqueKey),
          ip:           getClientIp(req),
        });

        res.status(409).json({
          success:     false,
          code:        "DUPLICATE_PURCHASE",
          message:     "Duplicate transaction detected. Please wait before retrying.",
          retry_after: DEDUP_TTL_SECONDS,
        });
        return;
      }

      next();
    } catch {
      // Redis unavailable — fail open so purchases aren't blocked by infra issues.
      next();
    }
  };
}
