import { getDbInstance } from "../../../db/knex";
import { AppError }      from "../../../shared/errors/AppError";
import { logComplianceAction } from "./complianceAudit.service";

const db = getDbInstance();

export type KycLevel = "none" | "tier_1" | "tier_2" | "tier_3";

export interface ListKycUsersFilters {
  kyc_level?:     KycLevel | string;
  search?:        string;
  bvn_verified?:  boolean;
  nin_verified?:  boolean;
  status?:        string;
  page?:          number;
  limit?:         number;
}

export interface ListKycVerificationsFilters {
  user_id?:            string;
  verification_type?:  string;
  status?:             string;
  from?:               string;
  to?:                 string;
  page?:               number;
  limit?:              number;
}

export async function listKycUsers(filters: ListKycUsersFilters) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .leftJoin(
      db("risk_scores")
        .select("*")
        .whereRaw(
          "id = (SELECT id FROM risk_scores WHERE user_id = risk_scores.user_id ORDER BY created_at DESC LIMIT 1)",
        )
        .as("rs"),
      "rs.user_id",
      "u.id",
    )
    .whereNull("u.deleted_at")
    .modify((q) => {
      if (filters.kyc_level) q.where("u.kyc_level", filters.kyc_level);
      if (filters.status)    q.where("u.status",    filters.status);

      if (typeof filters.bvn_verified === "boolean") {
        q.where("p.bvn_verified", filters.bvn_verified);
      }
      if (typeof filters.nin_verified === "boolean") {
        q.where("p.nin_verified", filters.nin_verified);
      }

      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("u.email ILIKE ?",    [term])
            .orWhereRaw("u.phone ILIKE ?",    [term])
            .orWhereRaw("u.username ILIKE ?", [term]);
        });
      }
    });

  const [{ count }] = await base
    .clone()
    .count<{ count: string }[]>("u.id as count");

  const rows = await base
    .clone()
    .orderBy("u.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "u.id",
      "u.email",
      "u.phone",
      "u.username",
      "u.status",
      "u.kyc_level",
      "u.created_at",
      "p.first_name",
      "p.last_name",
      "p.bvn",
      "p.nin",
      "p.bvn_verified",
      "p.nin_verified",
      db.raw("rs.score AS risk_score"),
      db.raw("rs.risk_level AS risk_level"),
      db.raw(
        "COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), u.email) AS user_name",
      ),
    );

  // Stats aggregation
  const [stats] = await db("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .whereNull("u.deleted_at")
    .select(
      db.raw("COUNT(*)::int AS total_users"),
      db.raw("COUNT(*) FILTER (WHERE u.kyc_level = 'tier_1')::int AS verified_tier1"),
      db.raw("COUNT(*) FILTER (WHERE u.kyc_level = 'tier_2')::int AS verified_tier2"),
      db.raw("COUNT(*) FILTER (WHERE u.kyc_level = 'tier_3')::int AS verified_tier3"),
      db.raw("COUNT(*) FILTER (WHERE u.kyc_level = 'none')::int AS pending"),
      db.raw("COUNT(*) FILTER (WHERE p.bvn_verified = true)::int AS bvn_verified"),
      db.raw("COUNT(*) FILTER (WHERE p.nin_verified = true)::int AS nin_verified"),
    );

  return {
    data:  rows,
    total: parseInt(count, 10),
    page,
    limit,
    stats,
  };
}

export async function listKycVerifications(filters: ListKycVerificationsFilters) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("kyc_verifications as kv")
    .leftJoin("users as u", "u.id", "kv.user_id")
    .leftJoin("user_profiles as p", "p.user_id", "kv.user_id")
    .modify((q) => {
      if (filters.user_id)           q.where("kv.user_id",           filters.user_id);
      if (filters.verification_type) q.where("kv.verification_type", filters.verification_type);
      if (filters.status)            q.where("kv.status",            filters.status);
      if (filters.from)              q.where("kv.created_at", ">=",  filters.from);
      if (filters.to)                q.where("kv.created_at", "<=",  filters.to);
    });

  const [{ count }] = await base
    .clone()
    .count<{ count: string }[]>("kv.id as count");

  const rows = await base
    .clone()
    .orderBy("kv.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "kv.id",
      "kv.user_id",
      "kv.verification_type",
      "kv.status",
      "kv.provider",
      "kv.provider_ref",
      "kv.verified_at",
      "kv.failure_reason",
      "kv.initiated_by",
      "kv.reviewed_by",
      "kv.reviewed_at",
      "kv.notes",
      "kv.created_at",
      "kv.updated_at",
      "u.email",
      "u.phone",
      "u.username",
      db.raw(
        "COALESCE(NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), ''), u.email) AS user_name",
      ),
    );

  return {
    data:  rows,
    total: parseInt(count, 10),
    page,
    limit,
  };
}

export async function updateKycStatus(
  userId:     string,
  input:      { kyc_level: KycLevel; notes?: string },
  actorId:    string,
  actorEmail: string,
) {
  const existing = await db("users")
    .where({ id: userId })
    .whereNull("deleted_at")
    .first("id", "kyc_level");

  if (!existing) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const [updated] = await db("users")
    .where({ id: userId })
    .update({ kyc_level: input.kyc_level, updated_at: new Date() })
    .returning(["id", "email", "phone", "username", "status", "kyc_level", "created_at", "updated_at"]);

  await logComplianceAction(db, {
    entity_type:  "user",
    entity_id:    userId,
    action:       "kyc_level_updated",
    actor_id:     actorId,
    actor_email:  actorEmail,
    before_state: { kyc_level: existing.kyc_level },
    after_state:  { kyc_level: input.kyc_level },
    notes:        input.notes ?? null,
  });

  return updated;
}
