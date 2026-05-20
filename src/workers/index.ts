// src/workers/index.ts
//
// Standalone background worker process entry point.
// Run with:  npm run worker:prod  (production)
//            npm run worker        (dev, with tsx watch)
//
// This process is SEPARATE from the API server (src/server.ts).
// In production both run in parallel:
//   Process 1: npm run start:prod   ← handles HTTP requests
//   Process 2: npm run worker:prod  ← processes background jobs

import '../config/index';
import { logger }  from '../lib/logger';
import { redis }   from '../config/redis';
import { config }  from '../config';

if (config.workers.disabled) {
  logger.info('DISABLE_WORKERS=true — standalone worker process skipped.');
  process.exit(0);
}

// Importing each worker registers it with BullMQ (side-effect on module load).
// Exported instances are needed for graceful shutdown.
import { airtimeWorker }         from '../modules/queue/workers/airtime.worker';
import { vtuPurchaseWorker }     from '../modules/queue/workers/vtu-purchase.worker';
import { paystackWebhookWorker } from '../modules/queue/workers/paystack-webhook.worker';
import { reconciliationWorker }  from '../modules/reconciliation/workers/reconciliation.worker';
import { notificationWorker }    from '../modules/notifications/workers/notification.worker';

const workers = [
  airtimeWorker,
  vtuPurchaseWorker,
  paystackWebhookWorker,
  reconciliationWorker,
  notificationWorker,
];

async function startWorkers() {
  logger.info('Worker process starting…', {
    env:     config.env,
    version: config.appVersion,
    queues:  ['airtime-purchases', 'vtu-purchases', 'paystack-webhooks', 'vtu-reconciliation', 'vtu-notifications'],
  });

  await redis.connect().catch(() => {
    // ioredis lazyConnect: ignore if already connected
  });
  logger.info('Redis connected (workers)');

  logger.info('Workers ready — waiting for jobs…', { count: workers.length });

  async function shutdown(signal: string) {
    logger.info(`Worker received ${signal} — shutting down gracefully…`);

    await Promise.allSettled(workers.map((w) => w.close()));
    logger.info('All workers closed');

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
