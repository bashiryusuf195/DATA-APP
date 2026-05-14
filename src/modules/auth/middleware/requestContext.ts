// src/modules/auth/middleware/requestContext.ts
// Applied globally at app level — injects req.requestId and
// req.deviceFingerprint early in the pipeline.

import type { Request, Response, NextFunction } from "express";
import { randomUUID }                           from "crypto";
import { deriveDeviceFingerprint } from "../../../lib/crypto";

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  // Stable correlation ID
  req.requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  res.setHeader("X-Request-ID", req.requestId);

  // Device fingerprint — client may override via header
  const clientFp = req.headers["x-device-fingerprint"] as string | undefined;
  req.deviceFingerprint = clientFp ?? deriveDeviceFingerprint({
    userAgent:      req.headers["user-agent"],
    acceptLanguage: req.headers["accept-language"] as string | undefined,
    ip:             req.ip,
    extra:          req.headers["x-forwarded-for"] as string | undefined,
  });

  next();
}
