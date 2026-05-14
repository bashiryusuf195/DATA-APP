// src/modules/auth/services/audit.service.ts
// Fire-and-forget writes to audit_logs (Migration 5).
// Failures are swallowed — audit must never break business ops.

import type { Knex }    from "knex";
import type { Request } from "express";

export type AuditAction =
  | "login"       | "login_failed"  | "logout"
  | "register"    | "password_change" | "password_reset"
  | "token_refresh" | "session_revoked"
  | "role_assign" | "role_revoke"   | "create"
  | "read"        | "update"        | "delete"
  | "approve"     | "reject"        | "export";

export interface WriteAuditOpts {
  actorId?:      string | null;
  actorType?:    "user" | "system" | "api_key" | "anonymous";
  action:        AuditAction;
  outcome:       "success" | "failure";
  resourceType?: string;
  resourceId?:   string | null;
  oldValues?:    Record<string, unknown>;
  newValues?:    Record<string, unknown>;
  errorMessage?: string | null;
  metadata?:     Record<string, unknown>;
}

/** Extract common request context for audit rows. */
export function extractRequestContext(req: Request) {
  const ip =
    ((req.headers["x-forwarded-for"] as string) ?? "")
      .split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    null;

  return {
    ip_address: ip,
    user_agent: (req.headers["user-agent"] as string) ?? null,
    request_id: req.requestId ?? null,
    session_id: req.sessionId ?? null,
  };
}

/**
 * Fire-and-forget audit log write.
 * Never throws — call without await from controllers.
 */
export function writeAuditLog(db: Knex, req: Request, opts: WriteAuditOpts): void {
  const ctx = extractRequestContext(req);

  db("audit_logs")
    .insert({
      actor_id:      opts.actorId      ?? null,
      actor_type:    opts.actorType    ?? "user",
      action:        opts.action,
      outcome:       opts.outcome,
      resource_type: opts.resourceType ?? "auth",
      resource_id:   opts.resourceId   ?? null,
      old_values:    JSON.stringify(opts.oldValues   ?? {}),
      new_values:    JSON.stringify(opts.newValues   ?? {}),
      diff:          JSON.stringify({}),
      ip_address:    ctx.ip_address,
      user_agent:    ctx.user_agent,
      request_id:    ctx.request_id,
      session_id:    ctx.session_id,
      error_message: opts.errorMessage ?? null,
      metadata:      JSON.stringify(opts.metadata    ?? {}),
    })
    .catch((err: unknown) => {
      console.error("[audit] Write failed (non-fatal):", err);
    });
}
