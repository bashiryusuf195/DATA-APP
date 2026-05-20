import crypto from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError }      from "../../../shared/errors/AppError";

const db = getDbInstance();

export type KycLevel            = "none" | "tier_1" | "tier_2" | "tier_3";
export type VerificationType    = "bvn" | "nin";
export type VerificationStatus  = "pending" | "in_progress" | "verified" | "failed" | "expired" | "manual_review";

export interface KycVerificationRecord {
  id:                string;
  verification_type: VerificationType;
  status:            VerificationStatus;
  failure_reason:    string | null;
  verified_at:       string | null;
  created_at:        string;
  updated_at:        string;
}

export interface CustomerKycStatus {
  kyc_level:     KycLevel;
  bvn_verified:  boolean;
  nin_verified:  boolean;
  has_bvn:       boolean;
  has_nin:       boolean;
  verifications: KycVerificationRecord[];
}

export async function getCustomerKycStatus(userId: string): Promise<CustomerKycStatus> {
  const user = await db("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .where("u.id", userId)
    .whereNull("u.deleted_at")
    .first(
      "u.kyc_level",
      "p.bvn_verified",
      "p.nin_verified",
      db.raw("(p.bvn IS NOT NULL AND p.bvn != '') AS has_bvn"),
      db.raw("(p.nin IS NOT NULL AND p.nin != '') AS has_nin"),
    );

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const verifications = await db("kyc_verifications")
    .where({ user_id: userId })
    .whereIn("verification_type", ["bvn", "nin"])
    .orderBy("created_at", "desc")
    .select(
      "id",
      "verification_type",
      "status",
      "failure_reason",
      "verified_at",
      "created_at",
      "updated_at",
    );

  return {
    kyc_level:    (user.kyc_level    ?? "none") as KycLevel,
    bvn_verified: user.bvn_verified  ?? false,
    nin_verified: user.nin_verified  ?? false,
    has_bvn:      user.has_bvn       ?? false,
    has_nin:      user.has_nin       ?? false,
    verifications,
  };
}

export async function submitNin(userId: string, nin: string): Promise<KycVerificationRecord> {
  const existing = await db("kyc_verifications")
    .where({ user_id: userId, verification_type: "nin" })
    .whereIn("status", ["pending", "in_progress"])
    .first("id");

  if (existing) {
    throw new AppError(409, "VERIFICATION_PENDING", "A NIN verification is already pending review");
  }

  await db("user_profiles")
    .insert({ id: crypto.randomUUID(), user_id: userId, nin: nin.trim(), updated_at: new Date() })
    .onConflict("user_id")
    .merge({ nin: nin.trim(), updated_at: new Date() });

  const [record] = await db("kyc_verifications")
    .insert({
      id:                crypto.randomUUID(),
      user_id:           userId,
      verification_type: "nin",
      status:            "pending",
      initiated_by:      userId,
      verification_data: JSON.stringify({}),
      created_at:        new Date(),
      updated_at:        new Date(),
    })
    .returning([
      "id",
      "verification_type",
      "status",
      "failure_reason",
      "verified_at",
      "created_at",
      "updated_at",
    ]);

  return record as KycVerificationRecord;
}

export async function submitBvn(userId: string, bvn: string): Promise<KycVerificationRecord> {
  const existing = await db("kyc_verifications")
    .where({ user_id: userId, verification_type: "bvn" })
    .whereIn("status", ["pending", "in_progress"])
    .first("id");

  if (existing) {
    throw new AppError(409, "VERIFICATION_PENDING", "A BVN verification is already pending review");
  }

  await db("user_profiles")
    .insert({ id: crypto.randomUUID(), user_id: userId, bvn: bvn.trim(), updated_at: new Date() })
    .onConflict("user_id")
    .merge({ bvn: bvn.trim(), updated_at: new Date() });

  const [record] = await db("kyc_verifications")
    .insert({
      id:                crypto.randomUUID(),
      user_id:           userId,
      verification_type: "bvn",
      status:            "pending",
      initiated_by:      userId,
      verification_data: JSON.stringify({}),
      created_at:        new Date(),
      updated_at:        new Date(),
    })
    .returning([
      "id",
      "verification_type",
      "status",
      "failure_reason",
      "verified_at",
      "created_at",
      "updated_at",
    ]);

  return record as KycVerificationRecord;
}
