"use strict";
// src/workers/index.ts
//
// Entry point for the background worker process.
// Run with:  npm run worker
//
// This process is SEPARATE from the API server (src/server.ts).
// In production you run both in parallel:
//   Process 1: npm start        ← handles HTTP requests
//   Process 2: npm run worker   ← processes background jobs
//
// Workers are added here as each module is built.
// For now, this file starts cleanly and logs that it is ready.
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/index"); // ensure .env is loaded first
const logger_1 = require("../lib/logger");
const redis_1 = require("../config/redis");
const config_1 = require("../config");
async function startWorkers() {
    logger_1.logger.info('Worker process starting…', {
        env: config_1.config.env,
        version: config_1.config.appVersion,
    });
    // Connect Redis (lazy connect needs an explicit connect() call)
    await redis_1.redis.connect().catch(() => {
        // If Redis is already connected (e.g. re-import), this throws — ignore it
    });
    logger_1.logger.info('Redis connected (workers)');
    // ── Register workers here as modules are built ────────────────────────────
    // const { transactionWorker }    = await import('./transaction.worker');
    // const { webhookWorker }        = await import('./webhook.worker');
    // const { reconciliationWorker } = await import('./reconciliation.worker');
    // const { notificationWorker }   = await import('./notification.worker');
    logger_1.logger.info('Workers ready — waiting for jobs…', {
        queues: [
            'vtu:transactions (pending)',
            'vtu:webhooks_inbound (pending)',
            'vtu:notifications (pending)',
            'vtu:reconciliation (pending)',
        ],
    });
    // ── Graceful shutdown ─────────────────────────────────────────────────────
    // When the process receives SIGTERM (container stop) or SIGINT (Ctrl+C),
    // finish in-flight jobs then exit cleanly.
    async function shutdown(signal) {
        logger_1.logger.info(`Worker received ${signal} — shutting down…`);
        // Close individual workers once they are registered:
        // await Promise.all([
        //   transactionWorker.close(),
        //   webhookWorker.close(),
        //   reconciliationWorker.close(),
        //   notificationWorker.close(),
        // ]);
        await redis_1.redis.quit();
        logger_1.logger.info('Worker process exited cleanly.');
        process.exit(0);
    }
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
}
startWorkers().catch((err) => {
    logger_1.logger.error('Worker process failed to start', { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=index.js.map