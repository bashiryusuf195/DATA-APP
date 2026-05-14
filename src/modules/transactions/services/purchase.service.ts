import {
  getUserWalletBalance,
  walletService,
} from "../../wallet/services/wallet-api.service";

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
  const reference = generateTransactionReference("AIR");

  const senderWallet = await getUserWalletBalance(userId);

  const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;

  if (!settlementWalletId) {
    throw new Error("SYSTEM_SETTLEMENT_WALLET_ID missing from environment");
  }

  const provider = providerRegistry.getDefaultProvider();

  const debitResult = await walletService.transfer({
    from_wallet_id: senderWallet.wallet_id,
    to_wallet_id: settlementWalletId,
    amount: input.amount,
    currency: "NGN",
    description: `Airtime purchase for ${input.phone}`,
    idempotency_key: reference,
    reference_type: "airtime_purchase",
    metadata: {
      phone: input.phone,
      reference,
    },
  });

  const providerResult = await provider.purchase({
    service_type: "airtime",
    amount: input.amount,
    phone: input.phone,
    reference,
  });

  let refundResult = null;

  if (!providerResult.success) {
    refundResult = await walletService.transfer({
      from_wallet_id: settlementWalletId,
      to_wallet_id: senderWallet.wallet_id,
      amount: input.amount,
      currency: "NGN",
      description: `Refund for failed airtime purchase ${reference}`,
      idempotency_key: `${reference}_refund`,
      reference_type: "airtime_refund",
      metadata: {
        phone: input.phone,
        reference,
        reason: providerResult.message,
      },
    });
  }

  const transaction = await createTransaction({
    user_id: userId,
    reference,
    type: "airtime",
    status: providerResult.success ? "successful" : "failed",
    amount: input.amount,
    currency: "NGN",
    source_wallet_id: senderWallet.wallet_id,
    destination_wallet_id: settlementWalletId,
    journal_batch_id: debitResult.journal_batch_id,
    provider: providerResult.provider,
    provider_reference: providerResult.provider_reference,
    description: `Airtime purchase for ${input.phone}`,
    metadata: {
      provider_response: providerResult.raw_response,
      refund:
        refundResult === null
          ? null
          : {
              journal_batch_id: refundResult.journal_batch_id,
            },
    },
    processed_at: providerResult.success ? new Date() : null,
    failed_at: providerResult.success ? null : new Date(),
    failure_reason: providerResult.success ? null : providerResult.message,
  });

  const balance = await walletService.getWalletBalance(senderWallet.wallet_id);

  return {
    reference,
    transaction,
    provider_result: providerResult,
    refund: refundResult,
    balance,
  };
}