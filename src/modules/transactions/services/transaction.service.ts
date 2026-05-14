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