import { createQueue, createWorker, defaultJobOptions } from "../../queue/config/queue.config";
import type { ReconciliationJobPayload } from "../jobs/reconciliation.job";
import {
  createReconciliationReport,
  runReconciliation,
} from "../services/reconciliation.service";

const QUEUE_NAME = "reconciliation";

export const reconciliationQueue = createQueue(QUEUE_NAME);

export const reconciliationWorker = createWorker(QUEUE_NAME, async (job) => {
  const data = job.data as ReconciliationJobPayload;

  console.log(
    "[RECONCILIATION WORKER] Processing:",
    data.report_type,
    "| triggered_by:", data.triggered_by,
    `| attemptsMade=${job.attemptsMade}`
  );

  const reportId = await createReconciliationReport(
    data.report_type,
    data.triggered_by
  );

  console.log("[RECONCILIATION WORKER] Created report:", reportId);

  await runReconciliation(reportId);

  console.log("[RECONCILIATION WORKER] Completed report:", reportId);

  return { reportId };
});

reconciliationWorker.on("completed", (job) => {
  const result = job.returnvalue as { reportId?: string } | undefined;
  console.log(
    "[RECONCILIATION WORKER COMPLETED]",
    job.id,
    "| reportId:", result?.reportId ?? "unknown"
  );
});

reconciliationWorker.on("failed", (job, err) => {
  console.error(
    "[RECONCILIATION WORKER FAILED]",
    job?.id ?? "unknown",
    `| attempt ${job?.attemptsMade ?? "?"} of ${job?.opts?.attempts ?? "?"}`,
    "| err:", err.message
  );
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
