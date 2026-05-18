import { randomUUID }    from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError }      from "../../../shared/errors/AppError";
import { logComplianceAction } from "./complianceAudit.service";

const db = getDbInstance();

export type FlagType = "suspicious_volume" | "duplicate_funding" | "fraud_suspected" | "chargeback_risk" | "account_takeover" | "manual_review";
export type FlagSeverity = "low" | "medium" | "high" | "critical";
export type FlagStatus = "open" | "investigating" | "resolved" | "dismissed";

export interface ListRiskFlagsFilters {
  user_id?:    string;
  flag_type?:  string;
  severity?:   string;
  status?:     string;
  from?:       string;
  to?:         string;
  search?:     string;
  page?:       number;
  limit?:      number;
}

export interface CreateRiskFlagInput {
  user_id:          string;
  flag_type:        FlagType;
  severity:         FlagSeverity;
  title:            string;
  description?:     string;
  evidence?:        Record<string, unknown>;
  transaction_ref?: string;
}

export interface UpdateRiskFlagInput {
  status?:            FlagStatus;
  severity?:          FlagSeverity;
  assigned_to?:       string | null;
  resolution_notes?:  string;
}

export async function listRiskFlags(filters: ListRiskFlagsFilters) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("risk_flags as rf")
    .leftJoin("users as u",        "u.id",        "rf.user_id")
    .leftJoin("user_profiles as p", "p.user_id",  "rf.user_id")
    .modify((q) => {
      if (filters.user_id)   q.where("rf.user_id",   filters.user_id);
      if (filters.flag_type) q.where("rf.flag_type", filters.flag_type);
      if (filters.severity)  q.where("rf.severity",  filters.severity);
      if (filters.status)    q.where("rf.status",    filters.status);
      if (filters.from)      q.where("rf.created_at", ">=", filters.from);
      if (filters.to)        q.where("rf.created_at", "<=", filters.to);

      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("u.email ILIKE ?",   [term])
            .orWhereRaw("rf.title ILIKE ?",  [term]);
        });
      }
    });

  const [{ count }] = await base
    .clone()
    .count<{ count: string }[]>("rf.id as count");

  const rows = await base
    .clone()
    .orderBy("rf.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "rf.id",
      "rf.user_id",
      "rf.flag_type",
      "rf.severity",
      "rf.status",
      "rf.title",
      "rf.description",
      "rf.evidence",
      "rf.transaction_ref",
      "rf.flagged_by",
      "rf.assigned_to",
      "rf.resolved_by",
      "rf.resolved_at",
      "rf.resolution_notes",
      "rf.created_at",
      "rf.updated_at",
      "u.email",
      "u.phone",
      "u.username",
      db.raw(
        "COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), u.email) AS user_name",
      ),
    );

  // Stats aggregation
  const [stats] = await db("risk_flags")
    .select(
      db.raw("COUNT(*) FILTER (WHERE status = 'open')::int          AS open"),
      db.raw("COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating"),
      db.raw("COUNT(*) FILTER (WHERE status = 'resolved')::int      AS resolved"),
      db.raw("COUNT(*) FILTER (WHERE status = 'dismissed')::int     AS dismissed"),
      db.raw("COUNT(*) FILTER (WHERE severity = 'critical')::int    AS critical"),
      db.raw("COUNT(*) FILTER (WHERE severity = 'high')::int        AS high"),
    );

  return {
    data:  rows,
    total: parseInt(count, 10),
    page,
    limit,
    stats,
  };
}

export async function createRiskFlag(
  input:      CreateRiskFlagInput,
  actorId:    string,
  actorEmail: string,
) {
  const id = randomUUID();

  const [created] = await db("risk_flags")
    .insert({
      id,
      user_id:         input.user_id,
      flag_type:       input.flag_type,
      severity:        input.severity,
      status:          "open",
      title:           input.title,
      description:     input.description     ?? null,
      evidence:        input.evidence        ? JSON.stringify(input.evidence) : "{}",
      transaction_ref: input.transaction_ref ?? null,
      flagged_by:      actorId,
    })
    .returning("*");

  await logComplianceAction(db, {
    entity_type: "risk_flag",
    entity_id:   id,
    action:      "risk_flag_created",
    actor_id:    actorId,
    actor_email: actorEmail,
    after_state: created as unknown as Record<string, unknown>,
  });

  return created;
}

export async function updateRiskFlag(
  id:         string,
  input:      UpdateRiskFlagInput,
  actorId:    string,
  actorEmail: string,
) {
  const existing = await db("risk_flags").where({ id }).first();
  if (!existing) {
    throw new AppError(404, "RISK_FLAG_NOT_FOUND", "Risk flag not found");
  }

  const patch: Record<string, unknown> = { updated_at: new Date() };

  if (input.status !== undefined)           patch.status           = input.status;
  if (input.severity !== undefined)         patch.severity         = input.severity;
  if ("assigned_to" in input)               patch.assigned_to      = input.assigned_to ?? null;
  if (input.resolution_notes !== undefined) patch.resolution_notes = input.resolution_notes;

  if (input.status === "resolved" || input.status === "dismissed") {
    patch.resolved_by  = actorId;
    patch.resolved_at  = new Date();
  }

  const [updated] = await db("risk_flags")
    .where({ id })
    .update(patch)
    .returning("*");

  await logComplianceAction(db, {
    entity_type:  "risk_flag",
    entity_id:    id,
    action:       "risk_flag_updated",
    actor_id:     actorId,
    actor_email:  actorEmail,
    before_state: existing as unknown as Record<string, unknown>,
    after_state:  updated  as unknown as Record<string, unknown>,
  });

  return updated;
}
