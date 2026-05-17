// src/modules/audit/services/admin-audit.service.ts

import { NotFoundError } from "../../../lib/errors";
import {
  type AdminAuditOptions,
  type AdminAuditRow,
  type AdminAuditDetailRow,
  countAdminAuditLogs,
  fetchAdminAuditLogs,
  fetchAdminAuditLogById,
} from "../repositories/admin-audit.repository";

// ── Response shapes ───────────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id:             string;
  admin_id:       string;
  admin_email:    string | null;
  action:         string;
  description:    string;
  resource_type:  string | null;
  resource_id:    string | null;
  outcome:        "success" | "failure" | "partial";
  error_message:  string | null;
  ip_address:     string | null;
  user_agent:     string | null;
  request_id:     string | null;
  // extracted from metadata JSONB
  request_method: string | null;
  endpoint_path:  string | null;
  response_status: number | null;
  created_at:     string;
}

export interface AdminAuditListResult {
  logs:  AdminAuditEntry[];
  total: number;
}

export interface AdminAuditDetail extends AdminAuditEntry {
  old_values:   Record<string, unknown>;
  new_values:   Record<string, unknown>;
  request_body: Record<string, unknown> | null;
  request_params: Record<string, unknown> | null;
  request_query:  Record<string, unknown> | null;
  metadata:     Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type MetaShape = {
  method?:      string;
  path?:        string;
  status_code?: number;
  body?:        Record<string, unknown>;
  params?:      Record<string, unknown>;
  query?:       Record<string, unknown>;
};

function castEntry(row: AdminAuditRow): AdminAuditEntry {
  const meta = (row.metadata ?? {}) as MetaShape;
  return {
    id:              row.id,
    admin_id:        row.admin_id,
    admin_email:     row.admin_email  ?? null,
    action:          row.action,
    description:     row.description,
    resource_type:   row.resource_type  ?? null,
    resource_id:     row.resource_id    ?? null,
    outcome:         row.outcome,
    error_message:   row.error_message  ?? null,
    ip_address:      row.ip_address     ?? null,
    user_agent:      row.user_agent     ?? null,
    request_id:      row.request_id     ?? null,
    request_method:  meta.method        ?? null,
    endpoint_path:   meta.path          ?? null,
    response_status: meta.status_code   ?? null,
    created_at:      row.created_at,
  };
}

function castDetail(row: AdminAuditDetailRow): AdminAuditDetail {
  const base = castEntry(row);
  const meta = (row.metadata ?? {}) as MetaShape;
  return {
    ...base,
    old_values:     row.old_values    ?? {},
    new_values:     row.new_values    ?? {},
    request_body:   meta.body         ?? null,
    request_params: meta.params       ?? null,
    request_query:  meta.query        ?? null,
    metadata:       row.metadata      ?? {},
  };
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listAdminAuditLogs(
  opts: AdminAuditOptions,
): Promise<AdminAuditListResult> {
  const [total, rows] = await Promise.all([
    countAdminAuditLogs(opts),
    fetchAdminAuditLogs(opts),
  ]);
  return { logs: rows.map(castEntry), total };
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getAdminAuditLog(id: string): Promise<AdminAuditDetail> {
  const row = await fetchAdminAuditLogById(id);
  if (!row) throw new NotFoundError("Audit log entry");
  return castDetail(row);
}
