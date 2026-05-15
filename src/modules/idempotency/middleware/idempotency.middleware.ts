import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";

import {
  MissingIdempotencyKeyError,
  AppError,
} from "../../../lib/errors";

import {
  findActiveKey,
  createIdempotencyKey,
  storeIdempotencyResponse,
} from "../services/idempotency.service";

function hashBody(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? {}))
    .digest("hex");
}

export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const rawKey = req.headers["idempotency-key"];

  if (!rawKey || typeof rawKey !== "string" || rawKey.trim() === "") {
    return next(new MissingIdempotencyKeyError());
  }

  const key = rawKey.trim();
  const userId = req.user!.id;
  const endpoint = `${req.method}:${req.path}`;
  const requestHash = hashBody(req.body);

  try {
    const existing = await findActiveKey(userId, key);

    if (existing) {
      // Same user + same key + different payload → conflict
      if (existing.request_hash !== requestHash) {
        return next(
          new AppError(
            "Idempotency key was previously used with a different request body.",
            "IDEMPOTENCY_CONFLICT",
            409
          )
        );
      }

      // Same user + same key + same payload + response stored → replay
      if (existing.status_code !== null && existing.response_body !== null) {
        res.status(existing.status_code).json(existing.response_body);
        return;
      }

      // Same user + same key + same payload + no response yet → still in flight
      return next(
        new AppError(
          "A request with this idempotency key is still being processed.",
          "IDEMPOTENCY_IN_PROGRESS",
          409
        )
      );
    }

    // First time this key is seen — persist it before handing off to the
    // controller so concurrent duplicate requests see it and get 409.
    let record: Awaited<ReturnType<typeof createIdempotencyKey>>;

    try {
      record = await createIdempotencyKey({
        user_id: userId,
        idempotency_key: key,
        endpoint,
        request_hash: requestHash,
      });
    } catch {
      // Unique constraint race — another request inserted the same key between
      // our SELECT and INSERT. Treat it as in-flight.
      const raced = await findActiveKey(userId, key);
      if (raced) {
        return next(
          new AppError(
            "A request with this idempotency key is still being processed.",
            "IDEMPOTENCY_IN_PROGRESS",
            409
          )
        );
      }
      // Something else went wrong — propagate.
      throw new AppError(
        "Failed to register idempotency key.",
        "IDEMPOTENCY_ERROR",
        500
      );
    }

    // Intercept res.json so we can capture a successful response for replay.
    const originalJson = res.json.bind(res) as typeof res.json;

    (res.json as unknown as (body: unknown) => Response) = function (
      body: unknown
    ) {
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        storeIdempotencyResponse(record.id, statusCode, body).catch((err) => {
          console.error("[IDEMPOTENCY] Failed to store response:", err);
        });
      }
      return originalJson(body as Parameters<typeof originalJson>[0]);
    };

    next();
  } catch (err) {
    next(err);
  }
}
