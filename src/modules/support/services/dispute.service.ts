import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

function generateDisputeRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `DSP-${date}-${rand}`;
}

export type DisputeStatus     = "open" | "under_review" | "escalated" | "resolved" | "rejected" | "closed";
export type DisputeType       = "wrong_amount" | "not_delivered" | "duplicate_charge" | "unauthorized" | "provider_error" | "other";
export type DisputeResolution = "refund_issued" | "partial_refund" | "no_action" | "provider_credited" | "rejected";

export interface CreateDisputeData {
  ticket_id?:             string | null;
  user_id?:               string | null;
  user_email?:            string | null;
  transaction_reference?: string | null;
  dispute_type:           DisputeType;
  amount_disputed?:       number | null;
  currency?:              string;
}

export interface UpdateDisputeData {
  status?:            DisputeStatus;
  resolution?:        DisputeResolution | null;
  resolution_notes?:  string | null;
  ticket_id?:         string | null;
}

export async function adminListDisputes(filters: {
  status?:       string;
  dispute_type?: string;
  user_id?:      string;
  search?:       string;
  page?:         number;
  limit?:        number;
}) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("disputes as d").modify((q) => {
    if (filters.status)       q.where("d.status",       filters.status);
    if (filters.dispute_type) q.where("d.dispute_type", filters.dispute_type);
    if (filters.user_id)      q.where("d.user_id",      filters.user_id);
    if (filters.search) {
      const term = `%${filters.search}%`;
      q.where(function () {
        this.whereRaw("d.reference ILIKE ?",             [term])
          .orWhereRaw("d.user_email ILIKE ?",            [term])
          .orWhereRaw("d.transaction_reference ILIKE ?", [term]);
      });
    }
  });

  const [{ count }] = await base.clone().count<{ count: string }[]>("d.id as count");
  const rows = await base
    .clone()
    .orderBy("d.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select("*");

  return { data: rows, total: parseInt(count, 10), page, limit };
}

export async function createDispute(data: CreateDisputeData) {
  const [row] = await db("disputes")
    .insert({
      id:                    randomUUID(),
      reference:             generateDisputeRef(),
      ticket_id:             data.ticket_id             ?? null,
      user_id:               data.user_id               ?? null,
      user_email:            data.user_email             ?? null,
      transaction_reference: data.transaction_reference  ?? null,
      dispute_type:          data.dispute_type,
      amount_disputed:       data.amount_disputed        ?? null,
      currency:              data.currency               ?? "NGN",
    })
    .returning("*");
  return row;
}

export async function updateDispute(id: string, data: UpdateDisputeData) {
  const patch: Record<string, unknown> = { ...data, updated_at: new Date() };
  if (data.status === "resolved") patch.resolved_at = new Date();

  const rows = await db("disputes")
    .where({ id })
    .update(patch)
    .returning("*");
  return rows[0] ?? null;
}
