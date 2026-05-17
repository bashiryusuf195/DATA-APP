// src/modules/audit/repositories/admin-audit.repository.ts
// Read-only data access for GET /admin/audit-logs.
// Writes happen through adminAuditMiddleware (fire-and-forget).

import { getDbInstance } from "../../../db/knex";

// ── Options ────────────────────────────────────────────────────────────────────

export interface AdminAuditOptions {
  limit:     number;
  offset:    number;
  email?:    string;
  action?:   string;
  resource?: string;
  outcome?:  "success" | "failure" | "partial";
  from?:     string;
  to?:       string;
}

// ── Row types ──────────────────────────────────────────────────────────────────

export interface AdminAuditRow {
  id:            string;
  admin_id:      string;
  admin_email:   string | null;
  action:        string;
  description:   string;
  resource_type: string | null;
  resource_id:   string | null;
  outcome:       "success" | "failure" | "partial";
  error_message: string | null;
  ip_address:    string | null;
  user_agent:    string | null;
  request_id:    string | null;
  metadata:      Record<string, unknown>;
  created_at:    string;
}

export interface AdminAuditDetailRow extends AdminAuditRow {
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
}

// ── Filter builder ─────────────────────────────────────────────────────────────

function applyFilters(
  query: ReturnType<ReturnType<typeof getDbInstance>>,
  opts:  AdminAuditOptions,
): void {
  if (opts.email)    query.where("u.email", "ilike", `%${opts.email}%`);
  if (opts.action)   query.where("a.action", opts.action);
  if (opts.resource) query.where("a.resource_type", opts.resource);
  if (opts.outcome)  query.where("a.outcome", opts.outcome);
  if (opts.from)     query.where("a.created_at", ">=", opts.from);
  if (opts.to)       query.where("a.created_at", "<=", opts.to);
}

// ── Count ─────────────────────────────────────────────────────────────────────

export async function countAdminAuditLogs(
  opts: AdminAuditOptions,
): Promise<number> {
  const db    = getDbInstance();
  const query = db("admin_activity_logs as a").leftJoin(
    "users as u",
    "u.id",
    "a.admin_id",
  );
  applyFilters(query, opts);
  const result = await query
    .count("a.id as count")
    .first<{ count: string }>();
  return Number(result?.count ?? 0);
}

// ── Paginated list ─────────────────────────────────────────────────────────────

export async function fetchAdminAuditLogs(
  opts: AdminAuditOptions,
): Promise<AdminAuditRow[]> {
  const db    = getDbInstance();
  const query = db("admin_activity_logs as a").leftJoin(
    "users as u",
    "u.id",
    "a.admin_id",
  );
  applyFilters(query, opts);

  return query
    .select([
      "a.id",
      "a.admin_id",
      "u.email as admin_email",
      "a.action",
      "a.description",
      "a.resource_type",
      "a.resource_id",
      "a.outcome",
      "a.error_message",
      "a.ip_address",
      "a.user_agent",
      "a.request_id",
      "a.metadata",
      "a.created_at",
    ])
    .orderBy("a.created_at", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
}

// ── Single entry detail ────────────────────────────────────────────────────────

export async function fetchAdminAuditLogById(
  id: string,
): Promise<AdminAuditDetailRow | null> {
  const db = getDbInstance();

  const row = await db("admin_activity_logs as a")
    .leftJoin("users as u", "u.id", "a.admin_id")
    .where("a.id", id)
    .select([
      "a.id",
      "a.admin_id",
      "u.email as admin_email",
      "a.action",
      "a.description",
      "a.resource_type",
      "a.resource_id",
      "a.outcome",
      "a.error_message",
      "a.ip_address",
      "a.user_agent",
      "a.request_id",
      "a.old_values",
      "a.new_values",
      "a.metadata",
      "a.created_at",
    ])
    .first<AdminAuditDetailRow>();

  return row ?? null;
}
