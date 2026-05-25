import { createQueue, createWorker, defaultJobOptions } from "../../queue/config/queue.config";
import type { ReconciliationJobPayload } from "../jobs/reconciliation.job";
import {
  createReconciliationReport,
  runReconciliation,
  runProviderReconciliation,
} from "../services/reconciliation.service";
import { logger } from "../../../lib/logger";

const QUEUE_NAME = "reconciliation";

export const reconciliationQueue = createQueue(QUEUE_NAME);

export const reconciliationWorker = createWorker(QUEUE_NAME, async (job) => {
  const data = job.data as ReconciliationJobPayload;

  logger.info("reconciliation_worker_start", {
    report_type:  data.report_type,
    triggered_by: data.triggered_by,
    attempt:      job.attemptsMade,
  });

  // ── Phase 1: audit report (issues, wallet balance checks) ──────────────────
  const reportId = await createReconciliationReport(data.report_type, data.triggered_by);
  await runReconciliation(reportId);

  logger.info("reconciliation_worker_audit_done", { report_id: reportId });

  // ── Phase 2: automated provider reconciliation ──────────────────────────────
  // Queries each stale transaction's provider and repairs/refunds as needed.
  const providerResult = await runProviderReconciliation();

  logger.info("reconciliation_worker_provider_done", { ...providerResult });

  return { reportId, providerResult };
});

reconciliationWorker.on("completed", (job) => {
  const result = job.returnvalue as { reportId?: string; providerResult?: Record<string, number> } | undefined;
  logger.info("reconciliation_worker_completed", {
    job_id:          job.id,
    report_id:       result?.reportId ?? "unknown",
    provider_result: result?.providerResult ?? null,
  });
});

reconciliationWorker.on("failed", (job, err) => {
  logger.error("reconciliation_worker_failed", {
    job_id:  job?.id ?? "unknown",
    attempt: job?.attemptsMade ?? "?",
    max:     job?.opts?.attempts ?? "?",
    error:   err.message,
  });
});

// Register the repeating job every 15 minutes.
// BullMQ is idempotent for repeating jobs: re-adding the same
// name + repeat options on restart updates rather than duplicates.
reconciliationQueue
  .add(
    "full_reconciliation",
    { report_type: "full_reconciliation", triggered_by: "scheduler" } satisfies ReconciliationJobPayload,
    { ...defaultJobOptions, repeat: { every: 15 * 60 * 1000 } }
  )
  .catch((err: Error) => {
    console.error("[RECONCILIATION] Failed to register repeating job:", err.message);
  });
