import { createWorker } from "../config/queue.config";
import type { VtuPurchaseJobPayload } from "../jobs/vtu-purchase.job";
import { providerExecutionEngine } from "../../providers/services/provider-execution-engine.service";
import { recordFailedJob } from "../services/failed-job.service";
import {
  getTransactionByReference,
  updateTransactionStatus,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { getPlanByVariationCode } from "../../catalog/services/catalog.service";
import type { PlanProviderOverrides } from "../../providers/services/provider-execution-engine.service";
import { logger } from "../../../lib/logger";

export const vtuPurchaseWorker = createWorker(
  "vtu-purchases",

  async (job) => {
    const data = job.data as VtuPurchaseJobPayload;

    logger.info("vtu_job_start", {
      reference:    data.reference,
      service_type: data.service_type,
      attempt:      job.attemptsMade,
    });

    const transaction = await getTransactionByReference(data.reference);

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    await updateTransactionStatus(data.reference, { status: "processing" });

    // TEST-ONLY: simulate an unrecoverable infrastructure crash
    if (data.phone === "09999999999") {
      throw new Error("Forced worker crash");
    }

    // Resolve plan-level provider overrides — takes precedence over routing rules.
    let planOverrides: PlanProviderOverrides | undefined;
    if (data.variation_code) {
      const plan = await getPlanByVariationCode(data.service_type, data.variation_code).catch(() => null);
      if (plan?.primary_provider_code) {
        planOverrides = {
          primary_provider_code:  plan.primary_provider_code as string,
          fallback_provider_code: (plan.fallback_provider_code as string | null) ?? null,
        };
      }
    }

    const result = await providerExecutionEngine.executeWithFailover({
      service_type:   data.service_type,
      plan_overrides: planOverrides,
      purchase_input: {
        service_type:     data.service_type,
        amount:           data.amount,
        phone:            data.phone,
        smartcard_number: data.smartcard_number,
        meter_number:     data.meter_number,
        variation_code:   data.variation_code,
        customer_name:    data.customer_name,
        reference:        data.reference,
      },
      transaction_reference: data.reference,
      transaction: {
        user_id:               transaction.user_id,
        status:                transaction.status,
        source_wallet_id:      transaction.source_wallet_id ?? null,
        destination_wallet_id: transaction.destination_wallet_id ?? null,
        amount:                transaction.amount,
        currency:              transaction.currency ?? "NGN",
      },
    });

    logger.info("vtu_job_complete", {
      reference:        data.reference,
      service_type:     data.service_type,
      success:          result.success,
      final_provider:   result.final_provider ?? "none",
      total_attempts:   result.total_attempts,
      failover:         result.failover_triggered,
      idempotent:       result.idempotent_replay,
    });
  }
);

vtuPurchaseWorker.on("active", (job) => {
  logger.info("vtu_job_active", {
    job_id:  job.id,
    name:    job.name,
    attempt: job.attemptsMade,
  });
});

vtuPurchaseWorker.on("completed", (job) => {
  logger.info("vtu_job_completed", {
    job_id:    job.id,
    name:      job.name,
    reference: (job.data as VtuPurchaseJobPayload)?.reference ?? "unknown",
  });
});

// Fires after every failed attempt — record to dead-letter only when retries exhausted.
vtuPurchaseWorker.on("failed", async (job, err) => {
  if (!job) return;

  const data        = job.data as VtuPurchaseJobPayload;
  const maxAttempts = job.opts?.attempts ?? 3;
  const isFinal     = job.attemptsMade >= maxAttempts;

  logger.error("vtu_job_failed", {
    job_id:    job.id,
    attempt:   job.attemptsMade,
    max:       maxAttempts,
    is_final:  isFinal,
    reference: data?.reference ?? "unknown",
    error:     err.message,
  });

  if (!isFinal) return;

  try {
    await recordFailedJob({
      queue_name:    "vtu-purchases",
      job_name:      job.name,
      reference:     data?.reference ?? null,
      payload:       job.data as Record<string, unknown>,
      error_message: err.message,
      stack_trace:   err.stack ?? null,
      retry_count:   job.attemptsMade,
    });

    if (data?.reference) {
      // Guard: never overwrite a finalized status — engine may have succeeded
      // on a prior attempt even though the job itself later threw.
      const liveTx = await getTransactionByReference(data.reference).catch(() => null);
      if (liveTx && liveTx.status !== "successful" && liveTx.status !== "failed") {
        await updateTransactionStatus(data.reference, {
          status:         "failed",
          failure_reason: err.message,
        });
      }
    }

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
    }).catch((notifErr: unknown) => {
      logger.warn("vtu_job_admin_notification_failed", { error: (notifErr as Error).message });
    });

    logger.info("vtu_job_dead_letter_recorded", { reference: data?.reference ?? "unknown" });
  } catch (recordErr) {
    logger.error("vtu_job_dead_letter_record_failed", { error: (recordErr as Error).message });
  }
});
