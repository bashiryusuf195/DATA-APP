import { createWorker } from "../config/queue.config";

import type { VtuPurchaseJobPayload } from "../jobs/vtu-purchase.job";

import { getBestProvider } from "../../providers/services/provider-routing.service";
import { recordFailedJob } from "../services/failed-job.service";

import {
  getTransactionByReference,
  updateTransactionStatus,
} from "../../transactions/services/transaction.service";

import { walletService } from "../../wallet/services/wallet-api.service";
import { createNotification } from "../../notifications/services/notification.service";

console.log("[VTU WORKER MODULE LOADED v3]");

export const vtuPurchaseWorker = createWorker(
  "vtu-purchases",

  async (job) => {
    const data = job.data as VtuPurchaseJobPayload;

    console.log(
      "[VTU WORKER] Processing:",
      data.reference,
      data.service_type,
      `| attemptsMade=${job.attemptsMade}`,
      `| opts.attempts=${job.opts?.attempts ?? "unset"}`
    );

    const transaction = await getTransactionByReference(data.reference);

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    await updateTransactionStatus(data.reference, { status: "processing" });

    // TEST-ONLY: simulate an unrecoverable infrastructure crash to verify
    // BullMQ retry exhaustion and dead-letter persistence.
    if (data.phone === "09999999999") {
      throw new Error("Forced worker crash");
    }

    const provider = await getBestProvider(data.service_type);

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

    const notifType = providerResult.success ? "purchase_successful" : "purchase_failed";
    console.log(
      "[VTU WORKER] [NOTIFICATION CREATE START]",
      `| user_id=${transaction.user_id}`,
      `| reference=${data.reference}`,
      `| notifType=${notifType}`
    );
    try {
      const notifId = await createNotification({
        user_id: transaction.user_id,
        channel: "in_app",
        type:    notifType,
        title:   providerResult.success ? "Transaction Successful" : "Transaction Failed",
        message: providerResult.success
          ? `Your ${data.service_type} purchase was successful.`
          : `Your ${data.service_type} purchase failed and has been refunded.`,
        metadata: {
          reference: data.reference,
          type:      data.service_type,
          amount:    data.amount,
          ...(providerResult.success ? {} : { failure_reason: providerResult.message }),
        },
      });
      console.log("[VTU WORKER] [NOTIFICATION CREATE SUCCESS] id:", notifId);
    } catch (notifErr) {
      console.error("[VTU WORKER] [NOTIFICATION CREATE FAILED]", notifErr);
    }

    console.log("[VTU WORKER] Completed:", data.reference);
  }
);

vtuPurchaseWorker.on("active", (job) => {
  console.log(
    "[VTU WORKER ACTIVE]",
    job.id,
    `| name=${job.name}`,
    `| attemptsMade=${job.attemptsMade}`,
    `| opts.attempts=${job.opts?.attempts ?? "unset"}`
  );
});

vtuPurchaseWorker.on("completed", (job) => {
  console.log(
    "[VTU WORKER COMPLETED]",
    job.id,
    `| name=${job.name}`,
    `| ref=${(job.data as VtuPurchaseJobPayload)?.reference ?? "unknown"}`
  );
});

// Fires after every failed attempt (attemptsMade is already post-increment here).
// Record to dead-letter table only when all retries are exhausted.
vtuPurchaseWorker.on("failed", async (job, err) => {
  if (!job) return;

  const data = job.data as VtuPurchaseJobPayload;
  const maxAttempts = job.opts?.attempts ?? 3;
  const isFinalFailure = job.attemptsMade >= maxAttempts;

  console.error(
    "[VTU WORKER FAILED]",
    job.id,
    `| attempt ${job.attemptsMade} of ${maxAttempts}`,
    `| isFinal=${isFinalFailure}`,
    `| ref=${data?.reference ?? "unknown"}`,
    `| err=${err.message}`
  );

  if (!isFinalFailure) return;

  try {
    await recordFailedJob({
      queue_name: "vtu-purchases",
      job_name: job.name,
      reference: data?.reference ?? null,
      payload: job.data as Record<string, unknown>,
      error_message: err.message,
      stack_trace: err.stack ?? null,
      retry_count: job.attemptsMade,
    });

    if (data?.reference) {
      await updateTransactionStatus(data.reference, {
        status: "failed",
        failure_reason: err.message,
      });
    }

    try {
      await createNotification({
        user_id:  null,
        channel:  "in_app",
        type:     "admin_alert",
        title:    "Worker Job Permanently Failed",
        message:  `VTU job "${job.name}" (${data?.service_type ?? "unknown"}) for reference ${data?.reference ?? "unknown"} permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
        metadata: {
          queue_name:    "vtu-purchases",
          job_id:        job.id,
          reference:     data?.reference    ?? null,
          user_id:       data?.user_id      ?? null,
          service_type:  data?.service_type ?? null,
          error_message: err.message,
          retry_count:   job.attemptsMade,
        },
      });
    } catch (notifErr) {
      console.error("[VTU WORKER] Failed to create admin notification:", (notifErr as Error).message);
    }

    console.log(
      "[VTU WORKER] Dead-letter recorded for ref:",
      data?.reference ?? "unknown"
    );
  } catch (recordErr) {
    console.error("[VTU WORKER] Failed to record dead-letter:", recordErr);
  }
});
