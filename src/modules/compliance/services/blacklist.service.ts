import { randomUUID }    from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError }      from "../../../shared/errors/AppError";
import { logComplianceAction } from "./complianceAudit.service";

const db = getDbInstance();

export type BlacklistEntityType = "user" | "email" | "phone" | "bvn" | "nin" | "ip" | "card";

export interface ListBlacklistFilters {
  entity_type?:      string;
  search?:           string;
  include_removed?:  boolean;
  page?:             number;
  limit?:            number;
}

export interface AddToBlacklistInput {
  entity_type:   BlacklistEntityType;
  entity_value:  string;
  reason:        string;
  notes?:        string;
  metadata?:     Record<string, unknown>;
}

export async function listBlacklist(filters: ListBlacklistFilters) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("blacklist as bl")
    .modify((q) => {
      if (!filters.include_removed) q.where("bl.is_active", true);
      if (filters.entity_type)      q.where("bl.entity_type", filters.entity_type);

      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("bl.entity_value ILIKE ?", [term])
            .orWhereRaw("bl.reason ILIKE ?",       [term]);
        });
      }
    });

  const [{ count }] = await base
    .clone()
    .count<{ count: string }[]>("bl.id as count");

  const rows = await base
    .clone()
    .orderBy("bl.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "bl.id",
      "bl.entity_type",
      "bl.entity_value",
      "bl.reason",
      "bl.notes",
      "bl.added_by",
      "bl.removed_by",
      "bl.removed_at",
      "bl.is_active",
      "bl.metadata",
      "bl.created_at",
      "bl.updated_at",
    );

  return {
    data:  rows,
    total: parseInt(count, 10),
    page,
    limit,
  };
}

export async function addToBlacklist(
  input:      AddToBlacklistInput,
  actorId:    string,
  actorEmail: string,
) {
  // Check for existing active entry
  const existing = await db("blacklist")
    .where({ entity_type: input.entity_type, entity_value: input.entity_value, is_active: true })
    .first("id");

  if (existing) {
    throw new AppError(
      409,
      "ALREADY_BLACKLISTED",
      `An active blacklist entry already exists for this ${input.entity_type}`,
    );
  }

  const id = randomUUID();

  const [created] = await db("blacklist")
    .insert({
      id,
      entity_type:  input.entity_type,
      entity_value: input.entity_value,
      reason:       input.reason,
      notes:        input.notes    ?? null,
      added_by:     actorId,
      is_active:    true,
      metadata:     input.metadata ? JSON.stringify(input.metadata) : "{}",
    })
    .returning("*");

  await logComplianceAction(db, {
    entity_type: "blacklist",
    entity_id:   id,
    action:      "blacklist_added",
    actor_id:    actorId,
    actor_email: actorEmail,
    after_state: {
      entity_type:  input.entity_type,
      entity_value: input.entity_value,
      reason:       input.reason,
    },
  });

  return created;
}

export async function removeFromBlacklist(
  id:         string,
  input:      { reason?: string },
  actorId:    string,
  actorEmail: string,
) {
  const existing = await db("blacklist").where({ id }).first();

  if (!existing) {
    throw new AppError(404, "BLACKLIST_ENTRY_NOT_FOUND", "Blacklist entry not found");
  }

  if (!existing.is_active) {
    throw new AppError(409, "ALREADY_REMOVED", "Blacklist entry has already been removed");
  }

  const [updated] = await db("blacklist")
    .where({ id })
    .update({
      is_active:   false,
      removed_by:  actorId,
      removed_at:  new Date(),
      updated_at:  new Date(),
    })
    .returning("*");

  await logComplianceAction(db, {
    entity_type:  "blacklist",
    entity_id:    id,
    action:       "blacklist_removed",
    actor_id:     actorId,
    actor_email:  actorEmail,
    before_state: existing as unknown as Record<string, unknown>,
    after_state:  { is_active: false, removed_by: actorId },
    notes:        input.reason ?? null,
  });

  return updated;
}
