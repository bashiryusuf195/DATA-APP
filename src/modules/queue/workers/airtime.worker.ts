import { Job } from "bullmq";

import { createWorker } from "../config/queue.config";

import type { AirtimeJobPayload } from "../jobs/airtime.job";

import { providerRegistry } from "../../providers/services/provider-registry.service";

import {
  getTransactionByReference,
  updateTransactionStatus,
} from "../../transactions/services/transaction.service";

import { walletService } from "../../wallet/services/wallet-api.service";

export const airtimeWorker =
  createWorker(
    "airtime-purchases",

    async (job) => {
      const data =
        job.data as AirtimeJobPayload;

      console.log(
        "[AIRTIME WORKER] Processing:",
        data.reference
      );

      const transaction =
        await getTransactionByReference(
          data.reference
        );

      if (!transaction) {
        throw new Error(
          "Transaction not found"
        );
      }

      await updateTransactionStatus(
        data.reference,
        {
          status: "processing",
        }
      );

      const provider =
        providerRegistry.getDefaultProvider();

      const providerResult =
        await provider.purchase({
          service_type: "airtime",
          amount: data.amount,
          phone: data.phone,
          reference: data.reference,
        });

      let refundResult = null;

      if (!providerResult.success) {
        refundResult =
          await walletService.transfer({
            from_wallet_id:
              transaction.destination_wallet_id,

            to_wallet_id:
              transaction.source_wallet_id,

            amount: Number(
              transaction.amount
            ),

            currency:
              transaction.currency,

            description:
              `Refund for failed airtime purchase ${data.reference}`,

            idempotency_key:
              `${data.reference}_refund`,

            reference_type:
              "airtime_refund",

            metadata: {
              reference:
                data.reference,
            },
          });
      }

      await updateTransactionStatus(
        data.reference,
        {
          status:
            providerResult.success
              ? "successful"
              : "failed",

          provider_reference:
            providerResult.provider_reference,

          failure_reason:
            providerResult.success
              ? null
              : providerResult.message,

          metadata: {
            provider_response:
              providerResult.raw_response,

            refund:
              refundResult
                ? {
                    journal_batch_id:
                      refundResult.journal_batch_id,
                  }
                : null,
          },
        }
      );

      console.log(
        "[AIRTIME WORKER] Completed:",
        data.reference
      );
    }
  );

airtimeWorker.on(
  "failed",
  (job, err) => {
    console.error(
      "[AIRTIME WORKER FAILED]",
      job?.id,
      err
    );
  }
);