import { createWorker } from "../config/queue.config";
import type { AirtimeJobPayload } from "../jobs/airtime.job";
import { providerExecutionEngine } from "../../providers/services/provider-execution-engine.service";
import { recordFailedJob } from "../services/failed-job.service";
import {
  getTransactionByReference,
  updateTransactionStatus,
} from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { logger } from "../../../lib/logger";

// Worker-level hard timeout: provider has 30 s + engine overhead.
// 90 s should be unreachable under normal operation; it catches hung processes
// before BullMQ's own stall detection fires.
const WORKER_TIMEOUT_MS = 90_000;

logger.info("airtime_worker_module_loaded");

export const airtimeWorker = createWorker(
  "airtime-purchases",

  async (job) => {
    const data = job.data as AirtimeJobPayload;

    // ── 1. Start ──────────────────────────────────────────────────────────────
    logger.info("airtime_worker_job_started", {
      reference: data.reference,
      attempt:   job.attemptsMade,
      amount:    data.amount,
    });

    // ── 2. Fetch transaction ──────────────────────────────────────────────────
    const transaction = await getTransactionByReference(data.reference);

    if (!transaction) {
      logger.error("airtime_worker_transaction_not_found", { reference: data.reference });
      throw new Error("Transaction not found");
    }

    logger.info("airtime_worker_transaction_fetched", {
      reference:         data.reference,
      status:            transaction.status,
      has_source_wallet: Boolean(transaction.source_wallet_id),
      has_dest_wallet:   Boolean(transaction.destination_wallet_id),
    });

    // ── 3. Guard: never re-process a finalized transaction on BullMQ retry ───
    if (transaction.status === "successful" || transaction.status === "failed") {
      logger.info("airtime_worker_skip_terminal", {
        reference: data.reference,
        status:    transaction.status,
      });
      return;
    }

    // ── 4. Mark processing ────────────────────────────────────────────────────
    await updateTransactionStatus(data.reference, { status: "processing" });

    logger.info("airtime_worker_marked_processing", { reference: data.reference });

    // TEST-ONLY: simulate an unrecoverable infrastructure crash
    if (data.phone === "09999999999") {
      throw new Error("Forced worker crash");
    }

    // ── 5. Execute engine with worker-level timeout ───────────────────────────
    logger.info("airtime_worker_engine_starting", {
      reference:      data.reference,
      variation_code: data.variation_code ?? null,
    });

    let workerTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      workerTimer = setTimeout(
        () => reject(new Error(`Airtime worker engine timed out after ${WORKER_TIMEOUT_MS / 1000}s`)),
        WORKER_TIMEOUT_MS,
      );
    });

    let result: Awaited<ReturnType<typeof providerExecutionEngine.executeWithFailover>>;

    try {
      result = await Promise.race([
        providerExecutionEngine.executeWithFailover({
          service_type: "airtime",
          purchase_input: {
            service_type:   "airtime",
            amount:         data.amount,
            phone:          data.phone,
            reference:      data.reference,
            variation_code: data.variation_code,
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
        }),
        timeoutPromise,
      ]);
    } catch (engineErr) {
      // Log the live transaction state so we can diagnose stuck transactions
      const liveTx = await getTransactionByReference(data.reference).catch(() => null);
      logger.error("airtime_worker_engine_threw", {
        reference:   data.reference,
        live_status: liveTx?.status ?? "unknown",
        error:       (engineErr as Error).message,
      });

      // If the engine timed out and the transaction is still processing,
      // mark it failed now — don't wait for BullMQ dead-letter to do it
      if (
        (engineErr as Error).message.includes("timed out") &&
        liveTx && liveTx.status !== "successful" && liveTx.status !== "failed"
      ) {
        await updateTransactionStatus(data.reference, {
          status:         "failed",
          failure_reason: "Provider execution timed out — wallet queued for reconciliation review",
        }).catch((updateErr) =>
          logger.error("airtime_worker_timeout_update_failed", {
            reference: data.reference,
            error:     (updateErr as Error).message,
          })
        );
      }

      throw engineErr;
    } finally {
      clearTimeout(workerTimer);
    }

    // ── 6. Engine returned ────────────────────────────────────────────────────
    logger.info("airtime_worker_engine_completed", {
      reference:      data.reference,
      success:        result.success,
      pending:        result.pending,
      final_provider: result.final_provider ?? "none",
      attempts:       result.total_attempts,
      failover:       result.failover_triggered,
      idempotent:     result.idempotent_replay,
    });

    // ── 7. Safety net: engine must never leave a non-pending transaction in ───
    //      "processing". If it does, that is a bug — catch it before the job
    //      completes successfully and the transaction silently stays stuck.
    if (!result.pending) {
      const liveTx = await getTransactionByReference(data.reference).catch(() => null);
      const liveStatus = liveTx?.status ?? "unknown";

      if (liveTx && liveStatus === "processing") {
        logger.error("airtime_worker_stuck_processing_detected", {
          reference:     data.reference,
          engine_result: {
            success:    result.success,
            pending:    result.pending,
            idempotent: result.idempotent_replay,
          },
        });
        await updateTransactionStatus(data.reference, {
          status:         "failed",
          failure_reason: "Engine returned without finalizing transaction — check engine logs",
        });
      } else {
        logger.info("airtime_worker_tx_finalized", {
          reference:   data.reference,
          final_status: liveStatus,
        });
      }
    }
  }
);

airtimeWorker.on("active", (job) => {
  logger.info("airtime_worker_job_active", {
    job_id:  job.id,
    name:    job.name,
    attempt: job.attemptsMade,
  });
});

airtimeWorker.on("completed", (job) => {
  logger.info("airtime_worker_job_completed", {
    job_id:    job.id,
    name:      job.name,
    reference: (job.data as AirtimeJobPayload)?.reference ?? "unknown",
  });
});

// Fires after every failed attempt — only records to dead-letter when all retries exhausted.
// This handler fires for infrastructure failures (DB down, network, OOM, timeout).
// Provider-level failures are handled gracefully inside the engine and do NOT throw.
airtimeWorker.on("failed", async (job, err) => {
  if (!job) return;

  const data        = job.data as AirtimeJobPayload;
  const maxAttempts = job.opts?.attempts ?? 3;
  const isFinal     = job.attemptsMade >= maxAttempts;

  logger.error("airtime_worker_job_failed", {
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
      queue_name:    "airtime-purchases",
      job_name:      job.name,
      reference:     data?.reference ?? null,
      payload:       job.data as Record<string, unknown>,
      error_message: err.message,
      stack_trace:   err.stack ?? null,
      retry_count:   job.attemptsMade,
    });

    if (data?.reference) {
      // Guard: never overwrite a finalized status
      const liveTx = await getTransactionByReference(data.reference).catch(() => null);
      if (liveTx && liveTx.status !== "successful" && liveTx.status !== "failed") {
        logger.warn("airtime_worker_dead_letter_finalizing", {
          reference:   data.reference,
          live_status: liveTx.status,
        });
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
      logger.warn("airtime_worker_admin_notification_failed", { error: (notifErr as Error).message });
    });

    logger.info("airtime_worker_dead_letter_recorded", { reference: data?.reference ?? "unknown" });
  } catch (recordErr) {
    logger.error("airtime_worker_dead_letter_record_failed", { error: (recordErr as Error).message });
  }
});
