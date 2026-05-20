import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export type FundingStatus = "pending" | "successful" | "failed" | "abandoned";

export interface FundingTransaction {
  id:                 string;
  user_id:            string;
  reference:          string;
  provider_reference: string | null;
  payment_gateway:    string;
  amount:             number;   // NGN — what the customer paid
  currency:           string;
  status:             FundingStatus;
  payment_channel:    string | null;
  verified:           boolean;
  metadata:           Record<string, unknown>;
  paid_at:            Date | null;
  // Charge fields (null on legacy rows pre-migration)
  charge_type:        string | null;   // 'flat' | 'percentage' | 'none'
  charge_value:       number | null;   // rate at time of transaction
  charge_amount:      number | null;   // computed fee in NGN
  credited_amount:    number | null;   // amount - charge_amount; what lands in wallet
  created_at:         Date;
  updated_at:         Date;
}

export interface CreateFundingTransactionInput {
  user_id:          string;
  reference:        string;
  payment_gateway?: string;
  amount:           number;
  currency?:        string;
  charge_type?:     string;
  charge_value?:    number;
  charge_amount?:   number;
  credited_amount?: number;
  metadata?:        Record<string, unknown>;
}

export interface UpdateFundingTransactionInput {
  status?:             FundingStatus;
  provider_reference?: string | null;
  payment_channel?:    string | null;
  verified?:           boolean;
  paid_at?:            Date | null;
  metadata?:           Record<string, unknown>;
}

// ── Write ──────────────────────────────────────────────────────────────────────

export async function createFundingTransaction(
  input: CreateFundingTransactionInput
): Promise<FundingTransaction> {
  const now = new Date();
  const [row] = await db("funding_transactions")
    .insert({
      id:              randomUUID(),
      user_id:         input.user_id,
      reference:       input.reference,
      payment_gateway: input.payment_gateway ?? "paystack",
      amount:          input.amount,
      currency:        input.currency ?? "NGN",
      status:          "pending",
      verified:        false,
      metadata:        JSON.stringify(input.metadata ?? {}),
      charge_type:     input.charge_type   ?? "none",
      charge_value:    input.charge_value  ?? 0,
      charge_amount:   input.charge_amount ?? 0,
      credited_amount: input.credited_amount ?? input.amount,
      created_at:      now,
      updated_at:      now,
    })
    .returning("*");

  return coerce(row);
}

export async function updateFundingTransaction(
  id: string,
  patch: UpdateFundingTransactionInput
): Promise<FundingTransaction | null> {
  const update: Record<string, unknown> = { updated_at: new Date() };

  if (patch.status             !== undefined) update.status             = patch.status;
  if (patch.provider_reference !== undefined) update.provider_reference = patch.provider_reference;
  if (patch.payment_channel    !== undefined) update.payment_channel    = patch.payment_channel;
  if (patch.verified           !== undefined) update.verified           = patch.verified;
  if (patch.paid_at            !== undefined) update.paid_at            = patch.paid_at;
  if (patch.metadata           !== undefined) update.metadata           = JSON.stringify(patch.metadata);

  const [row] = await db("funding_transactions")
    .where({ id })
    .update(update)
    .returning("*");

  return row ? coerce(row) : null;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getFundingTransactionByReference(
  reference: string
): Promise<FundingTransaction | null> {
  const row = await db("funding_transactions").where({ reference }).first();
  return row ? coerce(row) : null;
}

export async function listFundingTransactions(options: {
  limit:           number;
  offset:          number;
  user_id?:        string;
  status?:         FundingStatus;
  payment_gateway?: string;
  verified?:       boolean;
}): Promise<FundingTransaction[]> {
  const rows = await db("funding_transactions")
    .modify((q) => {
      if (options.user_id)         q.where("user_id",         options.user_id);
      if (options.status)          q.where("status",          options.status);
      if (options.payment_gateway) q.where("payment_gateway", options.payment_gateway);
      if (options.verified !== undefined) q.where("verified", options.verified);
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);

  return rows.map(coerce);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function coerce(row: Record<string, unknown>): FundingTransaction {
  const amount = parseFloat(row.amount as string);
  return {
    id:                 row.id as string,
    user_id:            row.user_id as string,
    reference:          row.reference as string,
    provider_reference: (row.provider_reference as string | null) ?? null,
    payment_gateway:    row.payment_gateway as string,
    amount,
    currency:           row.currency as string,
    status:             row.status as FundingStatus,
    payment_channel:    (row.payment_channel as string | null) ?? null,
    verified:           row.verified as boolean,
    metadata:           (row.metadata as Record<string, unknown>) ?? {},
    paid_at:            row.paid_at ? new Date(row.paid_at as string) : null,
    charge_type:        (row.charge_type as string | null) ?? null,
    charge_value:       row.charge_value != null ? parseFloat(row.charge_value as string) : null,
    charge_amount:      row.charge_amount != null ? parseFloat(row.charge_amount as string) : null,
    credited_amount:    row.credited_amount != null ? parseFloat(row.credited_amount as string) : null,
    created_at:         new Date(row.created_at as string),
    updated_at:         new Date(row.updated_at as string),
  };
}
