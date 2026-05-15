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
    status: "pending" | "processing" | "successful" | "failed" | "reversed" | "cancelled";
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
      provider_reference: data.provider_reference ?? undefined,
      journal_batch_id: data.journal_batch_id ?? undefined,
      failure_reason: data.failure_reason ?? undefined,
      metadata: data.metadata ?? undefined,
      processed_at: data.status === "successful" ? new Date() : undefined,
      failed_at: data.status === "failed" ? new Date() : undefined,
      updated_at: new Date(),
      provider: data.provider ?? undefined,
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