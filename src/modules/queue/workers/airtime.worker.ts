import { createWorker } from "../config/queue.config";
import type { AirtimeJobPayload } from "../jobs/airtime.job";
import { providerExecutionEngine } from "../../providers/services/provider-execution-engine.service";
import { recordFailedJob } from "../services/failed-job.service";
import {
  getTransactionByReference,
  updateTransactionStatus,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";

console.log("[AIRTIME WORKER MODULE LOADED v4]");

export const airtimeWorker = createWorker(
  "airtime-purchases",

  async (job) => {
    const data = job.data as AirtimeJobPayload;

    console.log(
      "[AIRTIME WORKER] Processing:",
      data.reference,
      `| attemptsMade=${job.attemptsMade}`,
      `| opts.attempts=${job.opts?.attempts ?? "unset"}`
    );

    const transaction = await getTransactionByReference(data.reference);

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    await updateTransactionStatus(data.reference, { status: "processing" });

    // TEST-ONLY: simulate an unrecoverable infrastructure crash
    if (data.phone === "09999999999") {
      throw new Error("Forced worker crash");
    }

    // Execution engine handles: provider selection, failover, refund on failure,
    // transaction status update, and user notification.
    const result = await providerExecutionEngine.executeWithFailover({
      service_type: "airtime",
      purchase_input: {
        service_type:   "airtime",
        amount:         data.amount,
        phone:          data.phone,
        reference:      data.reference,
        variation_code: (data as unknown as { variation_code?: string }).variation_code,
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

    console.log(
      "[AIRTIME WORKER] Completed:", data.reference,
      `| success=${result.success}`,
      `| final_provider=${result.final_provider ?? "none"}`,
      `| attempts=${result.total_attempts}`,
      `| failover=${result.failover_triggered}`,
      `| idempotent=${result.idempotent_replay}`
    );
  }
);

airtimeWorker.on("active", (job) => {
  console.log(
    "[AIRTIME WORKER ACTIVE]", job.id,
    `| name=${job.name}`,
    `| attemptsMade=${job.attemptsMade}`,
    `| opts.attempts=${job.opts?.attempts ?? "unset"}`
  );
});

airtimeWorker.on("completed", (job) => {
  console.log(
    "[AIRTIME WORKER COMPLETED]", job.id,
    `| name=${job.name}`,
    `| ref=${(job.data as AirtimeJobPayload)?.reference ?? "unknown"}`
  );
});

// Fires after every failed attempt — record to dead-letter only when retries exhausted.
// Note: engine handles provider-level failures gracefully (no throw). This handler
// fires only for infrastructure failures (DB down, network, OOM).
airtimeWorker.on("failed", async (job, err) => {
  if (!job) return;

  const data        = job.data as AirtimeJobPayload;
  const maxAttempts = job.opts?.attempts ?? 3;
  const isFinal     = job.attemptsMade >= maxAttempts;

  console.error(
    "[AIRTIME WORKER FAILED]", job.id,
    `| attempt ${job.attemptsMade} of ${maxAttempts}`,
    `| isFinal=${isFinal}`,
    `| ref=${data?.reference ?? "unknown"}`,
    `| err=${err.message}`
  );

  if (!isFinal) return;

  try {
    await recordFailedJob({
      queue_name:    "airtime-purchases",
      job_name:      job.name,
      reference:     data?.reference ?? null,
      payload:       job.data as Record<string, unknown>,
      error_message: err.message,
      stack_trace:   err.stack ?? null,
      retry_count:   job.attemptsMade,
    });

    if (data?.reference) {
      await updateTransactionStatus(data.reference, {
        status:         "failed",
        failure_reason: err.message,
      });
    }

    await createNotification({
      user_id:  null,
      channel:  "in_app",
      type:     "admin_alert",
      title:    "Worker Job Permanently Failed",
      message:  `Airtime job "${job.name}" for reference ${data?.reference ?? "unknown"} permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
      metadata: {
        queue_name:    "airtime-purchases",
        job_id:        job.id,
        reference:     data?.reference ?? null,
        user_id:       data?.user_id   ?? null,
        error_message: err.message,
        retry_count:   job.attemptsMade,
      },
    }).catch((notifErr: unknown) => {
      console.error("[AIRTIME WORKER] Admin notification failed:", (notifErr as Error).message);
    });

    console.log("[AIRTIME WORKER] Dead-letter recorded for ref:", data?.reference ?? "unknown");
  } catch (recordErr) {
    console.error("[AIRTIME WORKER] Failed to record dead-letter:", recordErr);
  }
});
