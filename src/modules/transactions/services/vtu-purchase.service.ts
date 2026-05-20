import {
  getUserWalletBalance,
  walletService,
} from "../../wallet/services/wallet-api.service";

import { createTransaction } from "./transaction.service";

import { generateTransactionReference } from "../../../lib/reference";

import type { TransactionType } from "../types/transaction.types";

import type { ProviderServiceType } from "../../providers/types/provider.types";

const SERVICE_PREFIX: Record<ProviderServiceType, string> = {
  airtime: "AIR",
  data: "DAT",
  electricity: "ELC",
  cable_tv: "CAB",
  exam_pin: "EXM",
  identity_verification: "IDV",
  wallet_funding: "WLT",
};

const SERVICE_TRANSACTION_TYPE: Record<ProviderServiceType, TransactionType> = {
  airtime: "airtime",
  data: "data",
  electricity: "electricity",
  cable_tv: "cable_tv",
  exam_pin: "exam_pin",
  identity_verification: "identity_verification",
  wallet_funding: "airtime", // wallet_funding is not a purchasable type; fallback to airtime as sentinel
};

export interface VtuPlanMeta {
  plan_id: string;
  variation_code: string;
  plan_name: string;
  service_slug: string;
  service_name: string;
}

export interface VtuPurchaseInput {
  service_type: ProviderServiceType;
  amount: number;
  description: string;
  phone?: string;
  smartcard_number?: string;
  meter_number?: string;
  variation_code?: string;
  customer_name?: string;
  plan?: VtuPlanMeta;
}

export async function initializeVtuPurchase(
  userId: string,
  input: VtuPurchaseInput
) {
  const reference = generateTransactionReference(
    SERVICE_PREFIX[input.service_type]
  );

  const senderWallet = await getUserWalletBalance(userId);

  const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;

  if (!settlementWalletId) {
    throw new Error("SYSTEM_SETTLEMENT_WALLET_ID missing");
  }

  const debitResult = await walletService.transfer({
    from_wallet_id: senderWallet.wallet_id,
    to_wallet_id: settlementWalletId,
    amount: input.amount,
    currency: "NGN",
    description: input.description,
    idempotency_key: reference,
    reference_type: `${input.service_type}_purchase`,
    metadata: { reference },
  });

  const transaction = await createTransaction({
    user_id: userId,
    reference,
    type: SERVICE_TRANSACTION_TYPE[input.service_type],
    status: "pending",
    amount: input.amount,
    currency: "NGN",
    source_wallet_id: senderWallet.wallet_id,
    destination_wallet_id: settlementWalletId,
    journal_batch_id: debitResult.journal_batch_id,
    description: input.description,
    metadata: {
      phone: input.phone,
      smartcard_number: input.smartcard_number,
      meter_number: input.meter_number,
      variation_code: input.variation_code,
      customer_name: input.customer_name,
      ...(input.plan && {
        plan_id: input.plan.plan_id,
        plan_name: input.plan.plan_name,
        service_slug: input.plan.service_slug,
        service_name: input.plan.service_name,
      }),
    },
  });

  return { reference, transaction };
}
