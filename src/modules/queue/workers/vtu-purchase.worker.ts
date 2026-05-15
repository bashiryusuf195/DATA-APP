import { createWorker } from "../config/queue.config";

import type { VtuPurchaseJobPayload } from "../jobs/vtu-purchase.job";

import { providerRegistry } from "../../providers/services/provider-registry.service";

import {
  getTransactionByReference,
  updateTransactionStatus,
} from "../../transactions/services/transaction.service";

import { walletService } from "../../wallet/services/wallet-api.service";

export const vtuPurchaseWorker = createWorker(
  "vtu-purchases",

  async (job) => {
    const data = job.data as VtuPurchaseJobPayload;

    console.log("[VTU WORKER] Processing:", data.reference, data.service_type);

    const transaction = await getTransactionByReference(data.reference);

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    await updateTransactionStatus(data.reference, { status: "processing" });

    const provider = providerRegistry.getDefaultProvider();

    const providerResult = await provider.purchase({
      service_type: data.service_type,
      amount: data.amount,
      phone: data.phone,
      smartcard_number: data.smartcard_number,
      meter_number: data.meter_number,
      variation_code: data.variation_code,
      customer_name: data.customer_name,
      reference: data.reference,
    });

    let refundResult = null;

    if (!providerResult.success) {
      refundResult = await walletService.transfer({
        from_wallet_id: transaction.destination_wallet_id,
        to_wallet_id: transaction.source_wallet_id,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        description: `Refund for failed ${data.service_type} purchase ${data.reference}`,
        idempotency_key: `${data.reference}_refund`,
        reference_type: `${data.service_type}_refund`,
        metadata: { reference: data.reference },
      });
    }

    await updateTransactionStatus(data.reference, {
      status: providerResult.success ? "successful" : "failed",
      provider: providerResult.provider,
      provider_reference: providerResult.provider_reference,
      failure_reason: providerResult.success ? null : providerResult.message,
      metadata: {
        provider_response: providerResult.raw_response,
        refund: refundResult
          ? { journal_batch_id: refundResult.journal_batch_id }
          : null,
      },
    });

    console.log("[VTU WORKER] Completed:", data.reference);
  }
);

vtuPurchaseWorker.on("failed", (job, err) => {
  console.error("[VTU WORKER FAILED]", job?.id, err);
});
