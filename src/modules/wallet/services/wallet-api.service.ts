import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import {
  generateFundingReference,
  generateTransferReference,
} from "../../../lib/reference";

const db = getDbInstance();

export const walletService = new WalletService(db);

/**
 * Get wallet balance for a user.
 */
export async function getUserWalletBalance(userId: string) {
  const wallet = await db("wallets")
    .where({
      user_id: userId,
      wallet_type: "user",
    })
    .first();

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const balance = await walletService.getWalletBalance(wallet.id);

  return {
    wallet_id: wallet.id,
    currency: wallet.currency,
    balance,
  };
}

/**
 * Get wallet ledger entries.
 */
export async function getUserWalletLedger(userId: string, limit = 20) {
  const wallet = await db("wallets")
    .where({
      user_id: userId,
      wallet_type: "user",
    })
    .first();

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const ledger = await db("wallet_ledger")
    .where({ wallet_id: wallet.id })
    .orderBy("created_at", "desc")
    .limit(limit);

  return {
    wallet_id: wallet.id,
    entries: ledger,
  };
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

  const balance = await walletService.getWalletBalance(userWallet.id);

  return {
    reference,
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

  const balance = await walletService.getWalletBalance(senderWallet.id);

  return {
    reference,
    transfer: result,
    balance,
  };
}