import crypto from "crypto";
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

  const now = new Date();
  const ninShouldVerify = ["tier_1", "tier_2", "tier_3"].includes(input.kyc_level);
  const bvnShouldVerify = ["tier_2", "tier_3"].includes(input.kyc_level);
  const verificationNote = `KYC level set to ${input.kyc_level} by admin`;

  const [updated] = await db("users")
    .where({ id: userId })
    .update({ kyc_level: input.kyc_level, updated_at: now })
    .returning(["id", "email", "phone", "username", "status", "kyc_level", "created_at", "updated_at"]);

  // Sync user_profiles verification flags to match the new level
  await db("user_profiles")
    .where({ user_id: userId })
    .update({ nin_verified: ninShouldVerify, bvn_verified: bvnShouldVerify, updated_at: now });

  // Sync kyc_verifications records: approve or reject pending entries
  if (ninShouldVerify) {
    await db("kyc_verifications")
      .where({ user_id: userId, verification_type: "nin" })
      .whereIn("status", ["pending", "in_progress", "manual_review"])
      .update({ status: "verified", verified_at: now, reviewed_by: actorId, reviewed_at: now, notes: verificationNote, updated_at: now });
  }
  if (bvnShouldVerify) {
    await db("kyc_verifications")
      .where({ user_id: userId, verification_type: "bvn" })
      .whereIn("status", ["pending", "in_progress", "manual_review"])
      .update({ status: "verified", verified_at: now, reviewed_by: actorId, reviewed_at: now, notes: verificationNote, updated_at: now });
  }
  if (input.kyc_level === "none") {
    await db("kyc_verifications")
      .where({ user_id: userId })
      .whereIn("status", ["pending", "in_progress", "manual_review"])
      .update({ status: "failed", failure_reason: "KYC level reset by admin", reviewed_by: actorId, reviewed_at: now, notes: input.notes ?? null, updated_at: now });
  }

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

export async function reviewIdentityVerification(
  userId:     string,
  input:      { type: "nin" | "bvn"; action: "approve" | "reject"; notes?: string },
  actorId:    string,
  actorEmail: string,
) {
  const user = await db("users")
    .where({ id: userId })
    .whereNull("deleted_at")
    .first("id", "kyc_level");

  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  // Check the user has actually submitted this document type
  const profile = await db("user_profiles").where({ user_id: userId }).first("nin", "bvn", "nin_verified", "bvn_verified");
  const hasDoc = input.type === "nin" ? !!(profile?.nin) : !!(profile?.bvn);
  if (!hasDoc) {
    throw new AppError(422, "NO_DOCUMENT", `User has not submitted a ${input.type.toUpperCase()}`);
  }

  const now = new Date();
  const isApprove = input.action === "approve";

  // Update the latest pending/in_progress record, or create one for admin-initiated approvals
  const pending = await db("kyc_verifications")
    .where({ user_id: userId, verification_type: input.type })
    .whereIn("status", ["pending", "in_progress", "manual_review"])
    .orderBy("created_at", "desc")
    .first("id");

  if (pending) {
    await db("kyc_verifications")
      .where({ id: pending.id })
      .update({
        status:         isApprove ? "verified" : "failed",
        verified_at:    isApprove ? now : null,
        failure_reason: isApprove ? null : (input.notes ?? "Rejected by admin"),
        reviewed_by:    actorId,
        reviewed_at:    now,
        notes:          input.notes ?? null,
        updated_at:     now,
      });
  } else if (isApprove) {
    // No pending record — create a verified record for the admin override
    await db("kyc_verifications").insert({
      id:                crypto.randomUUID(),
      user_id:           userId,
      verification_type: input.type,
      status:            "verified",
      initiated_by:      userId,
      reviewed_by:       actorId,
      reviewed_at:       now,
      verified_at:       now,
      notes:             input.notes ?? "Approved by admin",
      verification_data: JSON.stringify({}),
      created_at:        now,
      updated_at:        now,
    });
  }

  // Sync user_profiles flag
  const flagUpdate = input.type === "nin"
    ? { nin_verified: isApprove, updated_at: now }
    : { bvn_verified: isApprove, updated_at: now };
  await db("user_profiles").where({ user_id: userId }).update(flagUpdate);

  // Auto-advance kyc_level when approving if the new verification unlocks a tier
  if (isApprove) {
    const LEVEL_NUM: Record<KycLevel, number> = { none: 0, tier_1: 1, tier_2: 2, tier_3: 3 };
    const currentNum = LEVEL_NUM[user.kyc_level as KycLevel] ?? 0;
    let newLevel: KycLevel | null = null;

    if (input.type === "nin" && currentNum < 1) {
      newLevel = "tier_1";
    } else if (input.type === "bvn" && currentNum < 2) {
      const updatedProfile = await db("user_profiles").where({ user_id: userId }).first("nin_verified");
      if (updatedProfile?.nin_verified) newLevel = "tier_2";
    }

    if (newLevel) {
      await db("users").where({ id: userId }).update({ kyc_level: newLevel, updated_at: now });
    }
  }

  await logComplianceAction(db, {
    entity_type:  "user",
    entity_id:    userId,
    action:       `${input.type}_${isApprove ? "approved" : "rejected"}`,
    actor_id:     actorId,
    actor_email:  actorEmail,
    before_state: {},
    after_state:  { [`${input.type}_verified`]: isApprove },
    notes:        input.notes ?? null,
  });

  return db("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .where("u.id", userId)
    .first(
      "u.id", "u.email", "u.phone", "u.username", "u.status", "u.kyc_level",
      "p.nin_verified", "p.bvn_verified", "p.nin", "p.bvn",
    );
}
