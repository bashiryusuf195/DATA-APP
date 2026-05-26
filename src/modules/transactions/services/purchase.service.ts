import {
  getUserWalletBalance,
  walletService,
} from "../../wallet/services/wallet-api.service";

import { createTransaction } from "./transaction.service";

import { generateTransactionReference } from "../../../lib/reference";
import { getSettlementWalletId } from "../../../lib/system-wallets";

export async function initializeAirtimePurchase(
  userId: string,
  input: {
    phone: string;
    amount: number;
  }
) {
  const reference =
    generateTransactionReference("AIR");

  const senderWallet =
    await getUserWalletBalance(userId);

  const settlementWalletId = await getSettlementWalletId();

  const debitResult =
    await walletService.transfer({
      from_wallet_id:
        senderWallet.wallet_id,

      to_wallet_id:
        settlementWalletId,

      amount: input.amount,

      currency: "NGN",

      description:
        `Airtime purchase for ${input.phone}`,

      idempotency_key: reference,

      reference_type:
        "airtime_purchase",

      metadata: {
        phone: input.phone,
        reference,
      },
    });

  const transaction =
    await createTransaction({
      user_id: userId,

      reference,

      type: "airtime",

      status: "pending",

      amount: input.amount,

      currency: "NGN",

      source_wallet_id:
        senderWallet.wallet_id,

      destination_wallet_id:
        settlementWalletId,

      journal_batch_id:
        debitResult.journal_batch_id,

      description:
        `Airtime purchase for ${input.phone}`,

      metadata: {
        phone: input.phone,
      },
    });

  return {
    reference,
    transaction,
  };
}