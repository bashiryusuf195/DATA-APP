import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";

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
export async function getUserWalletLedger(
  userId: string,
  limit = 20
) {
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