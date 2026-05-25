import { Queue } from "bullmq";
import { redis } from "../../../config/redis";
import { AppError } from "../../../lib/errors";
import {
  transactionQueue,
  webhookQueue,
  notificationQueue,
  reconciliationQueue,
  riskEventQueue,
  providerHealthQueue,
  dlqTransactions,
  dlqWebhooks,
  dlqNotifications,
} from "../../../config/queues";
import { airtimeQueue }         from "../queues/airtime.queue";
import { vtuPurchaseQueue }     from "../queues/vtu-purchase.queue";
import { paystackWebhookQueue } from "../queues/paystack-webhook.queue";
import { vtuVerifyPendingQueue } from "../queues/vtu-verify-pending.queue";

// ── Registry ──────────────────────────────────────────────────────────────────
// Single reference per queue name. Additional queues that are only defined
// inside worker files get a lightweight read-only client here.

const reconciliationMonitorQueue = new Queue("reconciliation", { connection: redis });

export const QUEUE_REGISTRY: Record<string, Queue> = {
  // Core queues (from src/config/queues.ts)
  "vtu-transactions":    transactionQueue,
  "vtu-webhooks-inbound": webhookQueue,
  "vtu-notifications":   notificationQueue,
  "vtu-reconciliation":  reconciliationQueue,
  "vtu-risk-events":     riskEventQueue,
  "vtu-provider-health": providerHealthQueue,
  // Dead-letter queues
  "vtu-dlq-transactions":  dlqTransactions,
  "vtu-dlq-webhooks":      dlqWebhooks,
  "vtu-dlq-notifications": dlqNotifications,
  // Module-level queues
  "airtime-purchases":  airtimeQueue,
  "vtu-purchases":      vtuPurchaseQueue,
  "paystack-webhooks":  paystackWebhookQueue,
  "vtu-verify-pending": vtuVerifyPendingQueue,
  "reconciliation":     reconciliationMonitorQueue,
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QueueStats {
  name:                   string;
  waiting:                number;
  active:                 number;
  completed:              number;
  failed:                 number;
  delayed:                number;
  paused:                 boolean;
  oldest_waiting_age_ms:  number | null;
  latest_failure_reason:  string | null;
  latest_failure_at:      number | null;  // epoch ms
}

export interface QueueJobItem {
  id:           string;
  name:         string;
  queue:        string;
  state:        string;
  data:         Record<string, unknown>;  // redacted
  attempts_made: number;
  failed_reason: string | null;
  timestamp:    number;               // job creation epoch ms
  processed_on: number | null;
  finished_on:  number | null;
}

export type JobState = "waiting" | "active" | "completed" | "failed" | "delayed";

// ── Payload redaction ──────────────────────────────────────────────────────────

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /auth/i,
  /pin/i,
  /private/i,
  /access[_-]?key/i,
  /bearer/i,
  /signature/i,
  /webhook[_-]?secret/i,
];

const PHONE_RE = /^(\+?234|0)?[789]\d{9}$/;
const ACCT_RE  = /^\d{10}$/;

function maskString(val: string): string {
  if (val.length <= 4) return "***";
  return "*".repeat(val.length - 4) + val.slice(-4);
}

function redactValue(key: string, val: unknown): unknown {
  if (typeof val === "object" && val !== null) {
    return redactPayload(val as Record<string, unknown>);
  }
  if (typeof val === "string") {
    if (PHONE_RE.test(val.replace(/\s/g, ""))) return maskString(val);
    if (ACCT_RE.test(val))                      return maskString(val);
  }
  if (SENSITIVE_KEY_PATTERNS.some((re) => re.test(key))) return "[REDACTED]";
  return val;
}

export function redactPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveQueue(queueName: string): Queue {
  const q = QUEUE_REGISTRY[queueName];
  if (!q) throw new AppError(`Unknown queue '${queueName}'`, "NOT_FOUND", 404);
  return q;
}

// ── getAllQueueStats ──────────────────────────────────────────────────────────

export async function getAllQueueStats(): Promise<QueueStats[]> {
  const entries = Object.entries(QUEUE_REGISTRY);

  const results = await Promise.allSettled(
    entries.map(async ([name, queue]) => {
      const [waiting, active, completed, failed, delayed, isPaused] =
        await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.isPaused(),
        ]);

      // Oldest waiting job
      let oldest_waiting_age_ms: number | null = null;
      if (waiting > 0) {
        const [oldestJob] = await queue.getJobs(["waiting"], 0, 0, true);
        if (oldestJob?.timestamp) {
          oldest_waiting_age_ms = Date.now() - oldestJob.timestamp;
        }
      }

      // Latest failed job reason
      let latest_failure_reason: string | null = null;
      let latest_failure_at:     number | null  = null;
      if (failed > 0) {
        const [latestFailed] = await queue.getJobs(["failed"], 0, 0, false);
        if (latestFailed) {
          latest_failure_reason = latestFailed.failedReason ?? null;
          latest_failure_at     = latestFailed.finishedOn   ?? null;
        }
      }

      return {
        name,
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
        oldest_waiting_age_ms,
        latest_failure_reason,
        latest_failure_at,
      } satisfies QueueStats;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<QueueStats> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ── getQueueJobs ─────────────────────────────────────────────────────────────

export async function getQueueJobs(
  queueName: string,
  state:     JobState,
  page:      number,
  limit:     number,
): Promise<{ items: QueueJobItem[]; total: number }> {
  const queue = resolveQueue(queueName);
  const start = (page - 1) * limit;
  const end   = start + limit - 1;

  const [jobs, count] = await Promise.all([
    queue.getJobs([state], start, end, false),
    (async () => {
      switch (state) {
        case "waiting":   return queue.getWaitingCount();
        case "active":    return queue.getActiveCount();
        case "completed": return queue.getCompletedCount();
        case "failed":    return queue.getFailedCount();
        case "delayed":   return queue.getDelayedCount();
        default:          return 0;
      }
    })(),
  ]);

  const items: QueueJobItem[] = jobs.map((j) => ({
    id:           j.id ?? "",
    name:         j.name,
    queue:        queueName,
    state,
    data:         redactPayload(j.data as Record<string, unknown>),
    attempts_made: j.attemptsMade,
    failed_reason: j.failedReason ?? null,
    timestamp:    j.timestamp,
    processed_on: j.processedOn  ?? null,
    finished_on:  j.finishedOn   ?? null,
  }));

  return { items, total: count };
}

// ── retryQueueJob ─────────────────────────────────────────────────────────────

export async function retryQueueJob(
  queueName: string,
  jobId:     string,
): Promise<void> {
  const queue = resolveQueue(queueName);
  const job   = await queue.getJob(jobId);
  if (!job) throw new AppError(`Job '${jobId}' not found in queue '${queueName}'`, "NOT_FOUND", 404);
  await job.retry("failed");
}

// ── removeQueueJob ────────────────────────────────────────────────────────────

export async function removeQueueJob(
  queueName: string,
  jobId:     string,
): Promise<void> {
  const queue = resolveQueue(queueName);
  const job   = await queue.getJob(jobId);
  if (!job) throw new AppError(`Job '${jobId}' not found in queue '${queueName}'`, "NOT_FOUND", 404);
  await job.remove();
}

// ── clearCompletedJobs ────────────────────────────────────────────────────────
// Removes completed jobs older than `graceMs` (default: 0 = all completed).

export async function clearCompletedJobs(
  queueName: string,
  graceMs    = 0,
  maxCount   = 1000,
): Promise<number> {
  const queue = resolveQueue(queueName);
  const removed = await queue.clean(graceMs, maxCount, "completed");
  return removed.length;
}
