// src/middleware/publicAudit.ts
// Structured audit log for sensitive public actions: login, wallet funding, purchases.
// Uses Winston (not DB) — fires after response via res.on("finish"), zero latency cost.

import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const REDACTED_KEYS = new Set([
  "password", "token", "secret", "key", "credential",
  "pin", "cvv", "otp", "hash", "signature", "private",
]);

// Strip /api/v1 prefix so path rules work for both direct and versioned mounts.
function basePath(req: Request): string {
  return req.path.replace(/^\/api\/v1/, "");
}

function shouldAudit(req: Request): boolean {
  if (req.method !== "POST") return false;
  const p = basePath(req);
  return (
    p === "/auth/login"       ||
    p === "/auth/register"    ||
    p.startsWith("/wallet/fund") ||
    p.startsWith("/transactions/")
  );
}

function resolveAction(req: Request): string {
  const p = basePath(req);
  if (p === "/auth/login")    return "user_login";
  if (p === "/auth/register") return "user_register";
  if (p.startsWith("/wallet/fund/initialize")) return "wallet_fund_initialize";
  if (p.startsWith("/wallet/fund/verify"))     return "wallet_fund_verify";
  if (p.startsWith("/wallet/fund"))            return "wallet_fund";
  if (p.startsWith("/transactions/"))          return "purchase";
  return "public_action";
}

function resolveIp(req: Request): string | null {
  return (
    ((req.headers["x-forwarded-for"] as string) ?? "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    const sensitive = [...REDACTED_KEYS].some(
      (s) => lower === s || lower.includes(s),
    );
    out[k] = sensitive ? "[REDACTED]" : v;
  }
  return out;
}

export function publicAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!shouldAudit(req)) return next();

  res.on("finish", () => {
    const action  = resolveAction(req);
    const outcome = res.statusCode < 400 ? "success" : "failure";

    logger.info("public_audit", {
      action,
      outcome,
      userId:     req.user?.id ?? null,
      ip:         resolveIp(req),
      method:     req.method,
      path:       req.path,
      statusCode: res.statusCode,
      requestId:  req.requestId ?? null,
      userAgent:  req.headers["user-agent"] ?? null,
      body:       sanitize(req.body as Record<string, unknown>),
    });
  });

  next();
}
