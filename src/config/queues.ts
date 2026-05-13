// src/config/queues.ts
//
// All BullMQ queue definitions in one place.
//
// A queue is like an async to-do list:
//   - The API "adds" a job  (e.g. "process this transaction")
//   - A worker "picks up" that job in the background
//   - If the worker fails, BullMQ retries automatically (with backoff)
//
// Rules:
//   1. Queue names are constants — never type them as strings elsewhere.
//   2. All queues share the same Redis connection.
//   3. Default job options apply to every job unless overridden.

import { Queue } from 'bullmq';
import { redis } from './redis';

const connection = redis;

// ── Queues ────────────────────────────────────────────────────────────────────
export const transactionQueue    = new Queue('vtu:transactions',    { connection });
export const webhookQueue        = new Queue('vtu:webhooks_inbound',{ connection });
export const notificationQueue   = new Queue('vtu:notifications',   { connection });
export const reconciliationQueue = new Queue('vtu:reconciliation',  { connection });
export const riskEventQueue      = new Queue('vtu:risk_events',     { connection });
export const providerHealthQueue = new Queue('vtu:provider_health', { connection });

// Dead-Letter Queues — jobs land here after all retry attempts are exhausted
export const dlqTransactions     = new Queue('vtu:dlq:transactions', { connection });
export const dlqWebhooks         = new Queue('vtu:dlq:webhooks',     { connection });
export const dlqNotifications    = new Queue('vtu:dlq:notifications',{ connection });

// ── Default job options ───────────────────────────────────────────────────────
// 4 attempts total: initial try + 3 retries with exponential backoff
// 2 s → 4 s → 8 s → 16 s
export const defaultJobOptions = {
  attempts: 4,
  backoff: {
    type:  'exponential' as const,
    delay: 2_000,
  },
  removeOnComplete: { count: 1_000 },
  removeOnFail:     false,   // keep failed jobs so we can inspect / replay them
} as const;

// ── Helper: add a job with consistent shape ───────────────────────────────────
export async function enqueue(
  queue:   Queue,
  name:    string,
  data:    Record<string, unknown>,
  options?: Partial<typeof defaultJobOptions>,
) {
  return queue.add(name, data, { ...defaultJobOptions, ...options });
}
