"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultJobOptions = exports.dlqNotifications = exports.dlqWebhooks = exports.dlqTransactions = exports.providerHealthQueue = exports.riskEventQueue = exports.reconciliationQueue = exports.notificationQueue = exports.webhookQueue = exports.transactionQueue = void 0;
exports.enqueue = enqueue;
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
const connection = redis_1.redis;
// ── Queues ────────────────────────────────────────────────────────────────────
exports.transactionQueue = new bullmq_1.Queue('vtu:transactions', { connection });
exports.webhookQueue = new bullmq_1.Queue('vtu:webhooks_inbound', { connection });
exports.notificationQueue = new bullmq_1.Queue('vtu:notifications', { connection });
exports.reconciliationQueue = new bullmq_1.Queue('vtu:reconciliation', { connection });
exports.riskEventQueue = new bullmq_1.Queue('vtu:risk_events', { connection });
exports.providerHealthQueue = new bullmq_1.Queue('vtu:provider_health', { connection });
// Dead-Letter Queues — jobs land here after all retry attempts are exhausted
exports.dlqTransactions = new bullmq_1.Queue('vtu:dlq:transactions', { connection });
exports.dlqWebhooks = new bullmq_1.Queue('vtu:dlq:webhooks', { connection });
exports.dlqNotifications = new bullmq_1.Queue('vtu:dlq:notifications', { connection });
// ── Default job options ───────────────────────────────────────────────────────
// 4 attempts total: initial try + 3 retries with exponential backoff
// 2 s → 4 s → 8 s → 16 s
exports.defaultJobOptions = {
    attempts: 4,
    backoff: {
        type: 'exponential',
        delay: 2_000,
    },
    removeOnComplete: { count: 1_000 },
    removeOnFail: false, // keep failed jobs so we can inspect / replay them
};
// ── Helper: add a job with consistent shape ───────────────────────────────────
async function enqueue(queue, name, data, options) {
    return queue.add(name, data, { ...exports.defaultJobOptions, ...options });
}
//# sourceMappingURL=queues.js.map