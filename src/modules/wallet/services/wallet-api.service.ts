import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import {
  generateFundingReference,
  generateTransferReference,
} from "../../../lib/reference";
import { createTransaction } from "../../transactions/services/transaction.service";
import { AppError } from "../../../lib/errors";

const db = getDbInstance();

export const walletService = new WalletService(db);

/**
 * Get wallet balance for a user.
 * Returns a flat numeric balance so the API response shape matches
 * the frontend WalletBalance type exactly.
 */
export async function getUserWalletBalance(userId: string) {
  const wallet = await db("wallets")
    .where({
      user_id: userId,
      wallet_type: "user",
    })
    .first();

  if (!wallet) {
    throw new AppError("Wallet not found for this account", "WALLET_NOT_FOUND", 404);
  }

  // getBalance() returns the authoritative numeric balance from the PostgreSQL
  // get_wallet_balance() function — NOT the WalletBalance object.
  const balance = await walletService.getBalance(wallet.id);

  return {
    wallet_id:   wallet.id as string,
    balance,                           // plain number — e.g. 5000.00
    currency:    wallet.currency as string,
    wallet_type: wallet.wallet_type as string,
    is_default:  wallet.is_default as boolean,
  };
}

/**
 * Get wallet ledger entries.
 * Returns { data, total } using the field names the frontend LedgerEntry type
 * expects: `type` (not `entry_type`) and `balance_after` (not `running_balance`).
 * All numeric columns are parsed to numbers — the pg driver returns them as strings.
 */
export async function getUserWalletLedger(userId: string, limit = 20) {
  const wallet = await db("wallets")
    .where({
      user_id: userId,
      wallet_type: "user",
    })
    .first();

  if (!wallet) {
    throw new AppError("Wallet not found for this account", "WALLET_NOT_FOUND", 404);
  }

  const rows = await db("wallet_ledger")
    .where({ wallet_id: wallet.id })
    .orderBy("created_at", "desc")
    .limit(limit);

  const data = rows.map((r: Record<string, unknown>) => ({
    id:           r.id as string,
    type:         (r.entry_type as string) as "credit" | "debit",
    amount:       parseFloat(r.amount as string),
    balance_after: r.running_balance != null ? parseFloat(r.running_balance as string) : 0,
    description:  (r.description as string) ?? "",
    reference:    (r.reference_id as string | null) ?? undefined,
    created_at:   r.created_at instanceof Date
      ? (r.created_at as Date).toISOString()
      : String(r.created_at),
  }));

  return { data, total: data.length };
}

/**
 * Development-only funding helper.
 * Transfers money from settlement wallet → user wallet.
 */
export async function fundUserWallet(userId: string, amount: number) {
  const userWallet = await db("wallets")
    .where({
      user_id: userId,
      wallet_type: "user",
    })
    .first();

  if (!userWallet) {
    throw new Error("Wallet not found");
  }

  const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;

  if (!settlementWalletId) {
    throw new Error("SYSTEM_SETTLEMENT_WALLET_ID missing from environment");
  }

  const reference = generateFundingReference();

  const result = await walletService.transfer({
    from_wallet_id: settlementWalletId,
    to_wallet_id: userWallet.id,
    amount,
    currency: "NGN",
    description: "Development wallet funding",
    idempotency_key: reference,
    reference_type: "wallet_funding",
    metadata: {
      reference,
    },
  });

  const transaction = await createTransaction({
    user_id: userId,
    reference,
    type: "wallet_funding",
    status: "successful",
    amount,
    currency: "NGN",
    source_wallet_id: settlementWalletId,
    destination_wallet_id: userWallet.id,
    journal_batch_id: result.journal_batch_id,
    description: "Development wallet funding",
    metadata: {
      wallet_reference: reference,
    },
    processed_at: new Date(),
  });

  const balance = await walletService.getWalletBalance(userWallet.id);

  return {
    reference,
    transaction,
    transfer: result,
    balance,
  };
}

/**
 * User wallet transfer.
 */
export async function transferBetweenWallets(
  userId: string,
  input: {
    to_wallet_id: string;
    amount: number;
    description?: string;
    idempotency_key?: string;
  }
) {
  const senderWallet = await db("wallets")
    .where({
      user_id: userId,
      wallet_type: "user",
    })
    .first();

  if (!senderWallet) {
    throw new Error("Sender wallet not found");
  }

  const receiverWallet = await db("wallets")
    .where({
      id: input.to_wallet_id,
    })
    .first();

  if (!receiverWallet) {
    throw new Error("Receiver wallet not found");
  }

  if (senderWallet.id === receiverWallet.id) {
    throw new Error("Cannot transfer to same wallet");
  }

  const reference = generateTransferReference();

  const result = await walletService.transfer({
    from_wallet_id: senderWallet.id,
    to_wallet_id: receiverWallet.id,
    amount: input.amount,
    currency: "NGN",
    description: input.description ?? "Wallet transfer",
    idempotency_key:
      input.idempotency_key ??
      `transfer_${userId}_${input.to_wallet_id}_${input.amount}_${Date.now()}`,
    reference_type: "wallet_transfer",
    metadata: {
      reference,
    },
  });

  const transaction = await createTransaction({
    user_id: userId,
    reference,
    type: "wallet_transfer",
    status: "successful",
    amount: input.amount,
    currency: "NGN",
    source_wallet_id: senderWallet.id,
    destination_wallet_id: receiverWallet.id,
    journal_batch_id: result.journal_batch_id,
    description: input.description ?? "Wallet transfer",
    metadata: {
      wallet_reference: reference,
    },
    processed_at: new Date(),
  });

  const balance = await walletService.getWalletBalance(senderWallet.id);

  return {
    reference,
    transaction,
    transfer: result,
    balance,
  };
}