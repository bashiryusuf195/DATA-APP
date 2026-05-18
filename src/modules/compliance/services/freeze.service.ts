import { getDbInstance } from "../../../db/knex";
import { AppError }      from "../../../shared/errors/AppError";
import { logComplianceAction } from "./complianceAudit.service";

const db = getDbInstance();

export interface FreezeInput {
  reason: string;
}

export interface UnfreezeInput {
  notes?: string;
}

export interface ListFrozenAccountsFilters {
  search?: string;
  from?:   string;
  to?:     string;
  page?:   number;
  limit?:  number;
}

export async function freezeAccount(
  userId:     string,
  input:      FreezeInput,
  actorId:    string,
  actorEmail: string,
) {
  const user = await db("users")
    .where({ id: userId })
    .whereNull("deleted_at")
    .first("id", "email", "status", "frozen_at");

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  if (user.status === "suspended" && user.frozen_at !== null) {
    throw new AppError(409, "ACCOUNT_ALREADY_FROZEN", "Account is already frozen");
  }

  const [updated] = await db("users")
    .where({ id: userId })
    .update({
      status:        "suspended",
      frozen_at:     new Date(),
      frozen_by:     actorId,
      frozen_reason: input.reason,
      updated_at:    new Date(),
    })
    .returning([
      "id",
      "email",
      "phone",
      "username",
      "status",
      "kyc_level",
      "frozen_at",
      "frozen_by",
      "frozen_reason",
      "created_at",
      "updated_at",
    ]);

  await logComplianceAction(db, {
    entity_type:  "user",
    entity_id:    userId,
    action:       "account_frozen",
    actor_id:     actorId,
    actor_email:  actorEmail,
    before_state: { status: user.status, frozen_at: user.frozen_at },
    after_state:  { status: "suspended", frozen_at: updated.frozen_at, frozen_reason: input.reason },
    notes:        input.reason,
  });

  return updated;
}

export async function unfreezeAccount(
  userId:     string,
  input:      UnfreezeInput,
  actorId:    string,
  actorEmail: string,
) {
  const user = await db("users")
    .where({ id: userId })
    .whereNull("deleted_at")
    .first("id", "email", "status", "frozen_at");

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  if (user.status !== "suspended" || user.frozen_at === null) {
    throw new AppError(409, "ACCOUNT_NOT_FROZEN", "Account is not currently frozen");
  }

  const [updated] = await db("users")
    .where({ id: userId })
    .update({
      status:        "active",
      frozen_at:     null,
      frozen_by:     null,
      frozen_reason: null,
      updated_at:    new Date(),
    })
    .returning([
      "id",
      "email",
      "phone",
      "username",
      "status",
      "kyc_level",
      "frozen_at",
      "frozen_by",
      "frozen_reason",
      "created_at",
      "updated_at",
    ]);

  await logComplianceAction(db, {
    entity_type:  "user",
    entity_id:    userId,
    action:       "account_unfrozen",
    actor_id:     actorId,
    actor_email:  actorEmail,
    before_state: { status: "suspended", frozen_at: user.frozen_at },
    after_state:  { status: "active", frozen_at: null },
    notes:        input.notes ?? null,
  });

  return updated;
}

export async function listFrozenAccounts(filters: ListFrozenAccountsFilters) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .where("u.status", "suspended")
    .whereNotNull("u.frozen_at")
    .whereNull("u.deleted_at")
    .modify((q) => {
      if (filters.from) q.where("u.frozen_at", ">=", filters.from);
      if (filters.to)   q.where("u.frozen_at", "<=", filters.to);

      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("u.email ILIKE ?",    [term])
            .orWhereRaw("u.username ILIKE ?", [term]);
        });
      }
    });

  const [{ count }] = await base
    .clone()
    .count<{ count: string }[]>("u.id as count");

  const rows = await base
    .clone()
    .orderBy("u.frozen_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "u.id",
      "u.email",
      "u.phone",
      "u.username",
      "u.status",
      "u.kyc_level",
      "u.frozen_at",
      "u.frozen_by",
      "u.frozen_reason",
      "u.created_at",
      "u.updated_at",
      "p.first_name",
      "p.last_name",
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
