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

import '../config/index';    // ensure .env is loaded first
import { logger }    from '../lib/logger';
import { redis }     from '../config/redis';
import { config }    from '../config';

async function startWorkers() {
  logger.info('Worker process starting…', {
    env:     config.env,
    version: config.appVersion,
  });

  // Connect Redis (lazy connect needs an explicit connect() call)
  await redis.connect().catch(() => {
    // If Redis is already connected (e.g. re-import), this throws — ignore it
  });
  logger.info('Redis connected (workers)');

  // ── Register workers here as modules are built ────────────────────────────
  // const { transactionWorker }    = await import('./transaction.worker');
  // const { webhookWorker }        = await import('./webhook.worker');
  // const { reconciliationWorker } = await import('./reconciliation.worker');
  // const { notificationWorker }   = await import('./notification.worker');

  logger.info('Workers ready — waiting for jobs…', {
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
  async function shutdown(signal: string) {
    logger.info(`Worker received ${signal} — shutting down…`);

    // Close individual workers once they are registered:
    // await Promise.all([
    //   transactionWorker.close(),
    //   webhookWorker.close(),
    //   reconciliationWorker.close(),
    //   notificationWorker.close(),
    // ]);

    await redis.quit();
    logger.info('Worker process exited cleanly.');
    process.exit(0);
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT');  });
}

startWorkers().catch((err: unknown) => {
  logger.error('Worker process failed to start', { error: (err as Error).message });
  process.exit(1);
});
