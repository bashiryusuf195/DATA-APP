// src/modules/auth/middleware/auditLogger.ts
// Global request-level audit middleware.
// Fires AFTER response via res.on("finish") — zero added latency.
// Logs only mutating requests or auth failures on GET routes.

import type { Request, Response, NextFunction } from "express";
import { getDbInstance } from "../../../db/knex";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    const shouldLog =
      MUTATING_METHODS.has(req.method) ||
      (req.user != null && res.statusCode >= 400);

    if (!shouldLog) return;

    const db = getDbInstance();
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim()
               ?? req.socket.remoteAddress
               ?? null;

    db("audit_logs")
      .insert({
        actor_id:      req.user?.id ?? null,
        actor_type:    req.user ? "user" : "anonymous",
        action:        resolveAction(req),
        outcome:       res.statusCode < 400 ? "success" : "failure",
        resource_type: resolveResourceType(req),
        resource_id:   req.params.id ?? null,
        ip_address:    ip,
        user_agent:    req.headers["user-agent"] ?? null,
        request_id:    req.requestId ?? null,
        session_id:    req.sessionId ?? null,
        error_message: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
        old_values:    JSON.stringify({}),
        new_values:    JSON.stringify({}),
        diff:          JSON.stringify({}),
        metadata:      JSON.stringify({
          method:      req.method,
          path:        req.path,
          status_code: res.statusCode,
        }),
      })
      .catch(() => { /* never surface audit failures */ });
  });

  next();
}

function resolveAction(req: Request): string {
  const path   = req.path.toLowerCase();
  const method = req.method.toUpperCase();
  if (path.includes("/auth/login"))           return "login";
  if (path.includes("/auth/logout"))          return "logout";
  if (path.includes("/auth/register"))        return "register";
  if (path.includes("/auth/change-password")) return "password_change";
  if (path.includes("/auth/refresh"))         return "token_refresh";
  if (method === "DELETE")                    return "delete";
  if (method === "POST")                      return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  return "read";
}

function resolveResourceType(req: Request): string {
  const path = req.path.toLowerCase();
  if (path.includes("/auth"))        return "session";
  if (path.includes("/wallet"))      return "wallet";
  if (path.includes("/transaction")) return "transaction";
  if (path.includes("/user"))        return "user";
  return "unknown";
}
