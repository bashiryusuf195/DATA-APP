import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import type { CreateTransactionInput } from "../types/transaction.types";

const db = getDbInstance();

export async function createTransaction(input: CreateTransactionInput) {
  const [transaction] = await db("transactions")
    .insert({
      id: randomUUID(),
      user_id: input.user_id,
      reference: input.reference,
      type: input.type,
      status: input.status ?? "pending",
      amount: input.amount,
      currency: input.currency ?? "NGN",
      source_wallet_id: input.source_wallet_id ?? null,
      destination_wallet_id: input.destination_wallet_id ?? null,
      journal_batch_id: input.journal_batch_id ?? null,
      provider: input.provider ?? null,
      provider_reference: input.provider_reference ?? null,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      processed_at: input.processed_at ?? null,
      failed_at: input.failed_at ?? null,
      failure_reason: input.failure_reason ?? null,
    })
    .returning("*");

  return transaction;
}

export async function updateTransactionStatus(
  reference: string,
  data: {
    status: "pending" | "processing" | "successful" | "failed" | "reversed" | "cancelled" | "requires_review";
    provider_reference?: string | null;
    journal_batch_id?: string | null;
    failure_reason?: string | null;
    metadata?: Record<string, unknown>;
    provider?: string | null;
  }
) {
  const [transaction] = await db("transactions")
    .where({ reference })
    .update({
      status: data.status,
      ...(data.provider_reference !== undefined ? { provider_reference: data.provider_reference } : {}),
      ...(data.journal_batch_id   !== undefined ? { journal_batch_id:   data.journal_batch_id   } : {}),
      ...(data.failure_reason     !== undefined ? { failure_reason:     data.failure_reason     } : {}),
      ...(data.metadata !== undefined
        ? { metadata: db.raw("COALESCE(metadata, '{}'::jsonb) || ?::jsonb", [JSON.stringify(data.metadata)]) }
        : {}),
      processed_at: data.status === "successful" ? new Date() : undefined,
      failed_at:    data.status === "failed"      ? new Date() : undefined,
      updated_at:   new Date(),
      ...(data.provider !== undefined ? { provider: data.provider } : {}),
    })
    .returning("*");

  return transaction;
}

export async function getTransactionByReference(reference: string) {
  return db("transactions")
    .where({ reference })
    .first();
}

export async function getTransactionByReferenceForUser(
  reference: string,
  userId: string
) {
  return db("transactions")
    .where({ reference, user_id: userId })
    .first();
}

export async function mergeTransactionMetadata(
  reference: string,
  additionalMetadata: Record<string, unknown>
): Promise<void> {
  await db("transactions")
    .where({ reference })
    .update({
      metadata: db.raw(
        "COALESCE(metadata, '{}'::jsonb) || ?::jsonb",
        [JSON.stringify(additionalMetadata)]
      ),
      updated_at: new Date(),
    });
}

export async function getUserTransactions(
  userId: string,
  options: {
    limit: number;
    offset: number;
    status?: string;
    type?: string;
  }
) {
  return db("transactions")
    .where({ user_id: userId })
    .modify((q) => {
      if (options.status) q.where({ status: options.status });
      if (options.type) q.where({ type: options.type });
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}

export async function listAllTransactions(options: {
  limit:      number;
  offset:     number;
  status?:    string;
  type?:      string;
  reference?: string;
  user_id?:   string;
}): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const base = db("transactions").modify((q) => {
    if (options.status)    q.where({ status: options.status });
    if (options.type)      q.where({ type: options.type });
    if (options.user_id)   q.where({ user_id: options.user_id });
    if (options.reference) q.whereRaw("reference ILIKE ?", [`%${options.reference}%`]);
  });

  const [countResult, rows] = await Promise.all([
    base.clone().count("id as count").first(),
    base.clone()
      .select(db.raw("*, type AS service_type"))
      .orderBy("created_at", "desc")
      .limit(options.limit)
      .offset(options.offset),
  ]);

  const total = Number((countResult as Record<string, unknown> | undefined)?.count ?? 0);
  return { rows: rows as Record<string, unknown>[], total };
}