import type { Knex } from "knex";
import { randomUUID } from "crypto";

export interface ComplianceLogInput {
  entity_type:   string;
  entity_id:     string;
  action:        string;
  actor_id?:     string | null;
  actor_email?:  string | null;
  before_state?: Record<string, unknown> | null;
  after_state?:  Record<string, unknown> | null;
  notes?:        string | null;
  ip_address?:   string | null;
}

/**
 * Appends an immutable audit entry to compliance_audit_log.
 * Wrapped in try-catch so a logging failure never crashes the calling operation.
 */
export async function logComplianceAction(
  db: Knex,
  input: ComplianceLogInput,
): Promise<void> {
  try {
    await db("compliance_audit_log").insert({
      id:           randomUUID(),
      entity_type:  input.entity_type,
      entity_id:    input.entity_id,
      action:       input.action,
      actor_id:     input.actor_id     ?? null,
      actor_email:  input.actor_email  ?? null,
      before_state: input.before_state ?? null,
      after_state:  input.after_state  ?? null,
      notes:        input.notes        ?? null,
      ip_address:   input.ip_address   ?? null,
      created_at:   new Date(),
    });
  } catch {
    // Intentionally swallowed — audit log failures must never block main operations.
  }
}
