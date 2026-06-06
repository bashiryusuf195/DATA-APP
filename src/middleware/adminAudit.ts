// src/middleware/adminAudit.ts
// Automatic audit middleware for all /admin mutating requests.
// Fires AFTER response via res.on("finish") — zero latency cost.
// Writes to admin_activity_logs (append-only; failures are swallowed).

import type { Request, Response, NextFunction } from "express";
import { getDbInstance } from "../db/knex";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Keys whose values must never be logged
const REDACTED_KEYS = new Set([
  "password", "token", "secret", "key", "credential",
  "pin", "cvv", "otp", "hash", "signature", "private",
]);

export function adminAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("finish", () => {
    if (!MUTATING_METHODS.has(req.method)) return;
    if (!req.user?.id) return; // unauthenticated requests are not logged here

    const db     = getDbInstance();
    const action = resolveAction(req);

    db("admin_activity_logs")
      .insert({
        admin_id:      req.user.id,
        action,
        description:   resolveDescription(action, req),
        resource_type: resolveResourceType(req),
        resource_id:   req.params.id ?? null,
        ip_address:    resolveIp(req),
        user_agent:    req.headers["user-agent"] ?? null,
        request_id:    req.requestId ?? null,
        outcome:       res.statusCode < 400 ? "success" : "failure",
        error_message: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
        metadata:      JSON.stringify({
          method:      req.method,
          path:        req.path,
          status_code: res.statusCode,
          params:      req.params,
          query:       sanitize(req.query as Record<string, unknown>),
          body:        sanitize(req.body as Record<string, unknown>),
        }),
      })
      .catch(() => { /* never surface audit failures */ });
  });

  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function resolveAction(req: Request): string {
  const path   = req.path.toLowerCase();
  const method = req.method.toUpperCase();

  if (path.includes("/content")) {
    if (path.includes("/publish")) return "content_publish";
    if (method === "POST")   return "content_create";
    if (method === "DELETE") return "content_delete";
    return "content_update";
  }
  if (path.includes("/providers") && !path.includes("routing") && !path.includes("health") && !path.includes("attempt")) {
    if (method === "POST")   return "provider_create";
    if (method === "DELETE") return "provider_delete";
    return "provider_update";
  }
  if (path.includes("/routing-rules") || path.includes("/provider-routing")) {
    if (method === "POST")   return "routing_rule_create";
    if (method === "DELETE") return "routing_rule_delete";
    return "routing_rule_update";
  }
  if (path.includes("/funding") || path.includes("/verify")) {
    return "funding_verify";
  }
  if (path.includes("/refund") || path.includes("/reversal") || path.includes("/reverse")) {
    return "refund_process";
  }
  if (path.includes("/users") && path.includes("/roles")) {
    return method === "DELETE" ? "role_revoke" : "role_assign";
  }
  if (path.includes("/users")) {
    return "user_update";
  }
  if (path.includes("/broadcast") || (path.includes("/notifications") && method === "POST")) {
    return "broadcast_notification";
  }
  if (path.includes("/journal-batches")) {
    return "journal_reverse";
  }
  if (path.includes("/catalog") || path.includes("/services") || path.includes("/plans")) {
    if (method === "POST")   return "catalog_create";
    if (method === "DELETE") return "catalog_delete";
    return "catalog_update";
  }
  if (method === "POST")   return "admin_create";
  if (method === "DELETE") return "admin_delete";
  if (method === "PUT" || method === "PATCH") return "admin_update";
  return "admin_action";
}

function resolveDescription(action: string, req: Request): string {
  const id = req.params.id ? ` (ID: ${req.params.id})` : "";
  const LABELS: Record<string, string> = {
    provider_create:        `Provider created`,
    provider_update:        `Provider updated${id}`,
    provider_delete:        `Provider deleted${id}`,
    routing_rule_create:    `Routing rule created`,
    routing_rule_update:    `Routing rule updated${id}`,
    routing_rule_delete:    `Routing rule deleted${id}`,
    funding_verify:         `Funding transaction verified${id}`,
    refund_process:         `Refund/reversal processed${id}`,
    role_assign:            `Role assigned to user${id}`,
    role_revoke:            `Role revoked from user${id}`,
    user_update:            `User account updated${id}`,
    broadcast_notification: `Broadcast notification sent`,
    journal_reverse:        `Journal batch reversed${id}`,
    catalog_create:         `Catalog entry created`,
    catalog_update:         `Catalog entry updated${id}`,
    catalog_delete:         `Catalog entry deleted${id}`,
    content_create:         `Site page created (${req.body?.slug ?? req.params.slug ?? ""})`,
    content_update:         `Site page updated${id}`,
    content_publish:        `Site page publish-state changed${id}`,
    content_delete:         `Site page deleted${id}`,
    admin_create:           `Admin resource created via ${req.path}`,
    admin_update:           `Admin resource updated via ${req.path}${id}`,
    admin_delete:           `Admin resource deleted via ${req.path}${id}`,
    admin_action:           `Admin action on ${req.path}`,
  };
  return LABELS[action] ?? `Admin action: ${action}`;
}

function resolveResourceType(req: Request): string | null {
  const path = req.path.toLowerCase();
  if (path.includes("/providers") && !path.includes("routing") && !path.includes("attempt")) return "provider";
  if (path.includes("/routing-rules") || path.includes("/provider-routing"))  return "routing_rule";
  if (path.includes("/funding"))         return "funding_transaction";
  if (path.includes("/refund"))          return "refund";
  if (path.includes("/users"))           return "user";
  if (path.includes("/notifications"))   return "notification";
  if (path.includes("/journal-batches")) return "journal_batch";
  if (path.includes("/wallet"))          return "wallet";
  if (path.includes("/catalog") || path.includes("/services") || path.includes("/plans")) return "service";
  if (path.includes("/content")) return "site_page";
  return null;
}
