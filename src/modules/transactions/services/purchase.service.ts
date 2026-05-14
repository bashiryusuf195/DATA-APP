import {
  getUserWalletBalance,
} from "../../wallet/services/wallet-api.service";

import { walletService } from "../../wallet/services/wallet-api.service";

import { providerRegistry } from "../../providers/services/provider-registry.service";

import { createTransaction } from "./transaction.service";

import { generateTransactionReference } from "../../../lib/reference";

export async function purchaseAirtime(
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

  const provider =
    providerRegistry.getDefaultProvider();

  const debitResult =
    await walletService.transfer({
      from_wallet_id:
        senderWallet.wallet_id,

      to_wallet_id:
        process.env.SYSTEM_SETTLEMENT_WALLET_ID!,

      amount: input.amount,

      currency: "NGN",

      description:
        `Airtime purchase for ${input.phone}`,

      idempotency_key: reference,

      reference_type: "airtime_purchase",

      metadata: {
        phone: input.phone,
        reference,
      },
    });

  const providerResult =
    await provider.purchase({
      service_type: "airtime",
      amount: input.amount,
      phone: input.phone,
      reference,
    });

  const transaction =
    await createTransaction({
      user_id: userId,

      reference,

      type: "airtime",

      status:
        providerResult.success
          ? "successful"
          : "failed",

      amount: input.amount,

      currency: "NGN",

      source_wallet_id:
        senderWallet.wallet_id,

      destination_wallet_id:
        process.env.SYSTEM_SETTLEMENT_WALLET_ID!,

      journal_batch_id:
        debitResult.journal_batch_id,

      provider:
        providerResult.provider,

      provider_reference:
        providerResult.provider_reference,

      description:
        `Airtime purchase for ${input.phone}`,

      metadata: {
        provider_response:
          providerResult.raw_response,
      },

      processed_at: new Date(),
    });

  return {
    reference,
    transaction,
    provider_result: providerResult,
  };
}