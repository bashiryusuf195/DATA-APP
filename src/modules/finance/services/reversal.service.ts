import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../shared/errors/AppError";

const db = getDbInstance();

export interface ReversalResult {
  id: string;
  transaction_id: string;
  user_id: string;
  status: string;
  amount: number;
  currency: string;
  reason: string;
  journal_batch_id: string | null;
  processed_at: Date;
  created_at: Date;
}

export interface RefundResult {
  id: string;
  transaction_id: string;
  user_id: string;
  status: string;
  amount: number;
  currency: string;
  reason: string;
  journal_batch_id: string | null;
  created_at: Date;
}

async function createBalancingJournalEntry(
  referenceType: "reversal" | "refund",
  referenceId: string,
  walletId: string,
  amount: number,
  currency: string,
  description: string,
  idempotencyKey: string,
  adminEmail: string,
): Promise<string | null> {
  try {
    // Insert journal batch (idempotent via ON CONFLICT DO NOTHING)
    const batchId = randomUUID();
    await db.raw(
      `INSERT INTO wallet_journal_batches (id, status, description, reference_type, reference_id, idempotency_key, posted_at, metadata)
       VALUES (?, 'posted', ?, ?, ?, ?, NOW(), ?::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        batchId,
        description,
        referenceType,
        referenceId,
        idempotencyKey,
        JSON.stringify({ admin_email: adminEmail }),
      ],
    );

    // Fetch actual batch id (in case ON CONFLICT skipped our insert)
    const batch = await db("wallet_journal_batches")
      .where({ idempotency_key: idempotencyKey })
      .select("id")
      .first();
    if (!batch) return null;

    const actualBatchId = batch.id as string;
    const now = new Date();

    // Credit user wallet (return funds)
    await db("wallet_ledger").insert({
      id:               randomUUID(),
      journal_batch_id: actualBatchId,
      wallet_id:        walletId,
      entry_type:       "credit",
      amount,
      signed_amount:    amount,
      currency,
      description,
      reference_type:   referenceType,
      reference_id:     referenceId,
      created_at:       now,
    });

    // Debit platform treasury wallet if available
    const treasury = await db("wallets")
      .where(function () {
        this.where("wallet_type", "treasury").orWhere("wallet_type", "platform");
      })
      .select("id")
      .first()
      .catch(() => null);

    if (treasury) {
      await db("wallet_ledger").insert({
        id:               randomUUID(),
        journal_batch_id: actualBatchId,
        wallet_id:        treasury.id as string,
        entry_type:       "debit",
        amount,
        signed_amount:    -amount,
        currency,
        description:      `Treasury debit: ${description}`,
        reference_type:   referenceType,
        reference_id:     referenceId,
        created_at:       now,
      });
    }

    return actualBatchId;
  } catch {
    return null;
  }
}

export async function reverseTransaction(
  transactionId: string,
  reason: string,
  adminId: string | null,
  adminEmail: string,
): Promise<ReversalResult> {
  const txn = await db("transactions").where({ id: transactionId }).first();
  if (!txn) throw new AppError(404, "NOT_FOUND", "Transaction not found");

  const status = (txn.status as string)?.toLowerCase();
  if (status === "reversed")  throw new AppError(409, "ALREADY_REVERSED", "Transaction has already been reversed");
  if (status === "refunded")  throw new AppError(409, "ALREADY_REFUNDED", "Transaction has already been refunded");
  if (status !== "successful") {
    throw new AppError(422, "INVALID_STATUS", `Only successful transactions can be reversed (current: ${status})`);
  }

  // Idempotency: check for existing non-failed reversal
  const existing = await db("reversals")
    .where({ transaction_id: transactionId })
    .whereNotIn("status", ["failed"])
    .first();
  if (existing) throw new AppError(409, "DUPLICATE", "A reversal already exists for this transaction");

  const reversalId = randomUUID();
  const amount     = parseFloat(String(txn.amount));
  const currency   = (txn.currency as string) ?? "NGN";

  const [reversal] = await db("reversals")
    .insert({
      id:             reversalId,
      transaction_id: transactionId,
      user_id:        txn.user_id as string,
      status:         "pending",
      amount,
      currency,
      reason,
      initiated_by:       adminId,
      provider_response:  JSON.stringify({}),
      metadata:           JSON.stringify({ initiated_by_email: adminEmail }),
    })
    .returning("*");

  const journalBatchId = txn.wallet_id
    ? await createBalancingJournalEntry(
        "reversal",
        reversalId,
        txn.wallet_id as string,
        amount,
        currency,
        `Reversal for transaction ${String(txn.reference ?? transactionId)}: ${reason}`,
        `reversal:${transactionId}`,
        adminEmail,
      )
    : null;

  // Update transaction status
  await db("transactions")
    .where({ id: transactionId })
    .update({ status: "reversed", updated_at: new Date() });

  // Finalise reversal record
  const [finalReversal] = await db("reversals")
    .where({ id: reversalId })
    .update({
      status:           "completed",
      journal_batch_id: journalBatchId,
      processed_at:     new Date(),
      updated_at:       new Date(),
    })
    .returning("*");

  return finalReversal as ReversalResult;
}

export async function refundTransaction(
  transactionId: string,
  reason: string,
  adminId: string | null,
  adminEmail: string,
): Promise<RefundResult> {
  const txn = await db("transactions").where({ id: transactionId }).first();
  if (!txn) throw new AppError(404, "NOT_FOUND", "Transaction not found");

  const status = (txn.status as string)?.toLowerCase();
  if (status === "refunded")  throw new AppError(409, "ALREADY_REFUNDED", "Transaction has already been refunded");
  if (status === "reversed")  throw new AppError(409, "ALREADY_REVERSED", "Transaction has already been reversed");
  if (!["failed", "successful"].includes(status)) {
    throw new AppError(422, "INVALID_STATUS", `Transaction cannot be refunded in status: ${status}`);
  }

  // Idempotency: check for existing non-failed refund
  const existing = await db("refunds")
    .where({ transaction_id: transactionId })
    .whereNotIn("status", ["failed"])
    .first();
  if (existing) throw new AppError(409, "DUPLICATE", "A refund already exists for this transaction");

  const refundId = randomUUID();
  const amount   = parseFloat(String(txn.amount));
  const currency = (txn.currency as string) ?? "NGN";

  const [refund] = await db("refunds")
    .insert({
      id:             refundId,
      transaction_id: transactionId,
      user_id:        txn.user_id as string,
      wallet_id:      txn.wallet_id ?? null,
      status:         "pending",
      amount,
      currency,
      reason,
      requested_by: adminId,
      metadata:     JSON.stringify({ requested_by_email: adminEmail }),
    })
    .returning("*");

  const journalBatchId = txn.wallet_id
    ? await createBalancingJournalEntry(
        "refund",
        refundId,
        txn.wallet_id as string,
        amount,
        currency,
        `Refund for transaction ${String(txn.reference ?? transactionId)}: ${reason}`,
        `refund:${transactionId}`,
        adminEmail,
      )
    : null;

  await db("transactions")
    .where({ id: transactionId })
    .update({ status: "refunded", updated_at: new Date() });

  const [finalRefund] = await db("refunds")
    .where({ id: refundId })
    .update({
      status:           "processed",
      journal_batch_id: journalBatchId,
      processed_at:     new Date(),
      updated_at:       new Date(),
    })
    .returning("*");

  return finalRefund as RefundResult;
}
