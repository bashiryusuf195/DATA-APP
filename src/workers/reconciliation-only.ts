// src/workers/reconciliation-only.ts
//
// Standalone entry point for the reconciliation worker only.
// Use this when you want to run reconciliation as a dedicated Railway service
// rather than bundling it with all workers in workers/index.ts.
//
// Run (prod):  node dist/workers/reconciliation-only.js
// Run (dev):   tsx src/workers/reconciliation-only.ts

import '../config/index';
import { logger } from '../lib/logger';
import { redis }  from '../config/redis';
import { config } from '../config';

if (config.workers.disabled) {
  logger.info('DISABLE_WORKERS=true — reconciliation worker skipped.');
  process.exit(0);
}

import { reconciliationWorker } from '../modules/reconciliation/workers/reconciliation.worker';

async function start() {
  logger.info('Reconciliation worker starting…', {
    env:    config.env,
    version: config.appVersion,
    queue:  'vtu-reconciliation',
  });

  await redis.connect().catch(() => {
    // ioredis lazyConnect: ignore if already connected
  });
  logger.info('Redis connected (reconciliation worker)');

  logger.info('Reconciliation worker ready — waiting for jobs…');

  async function shutdown(signal: string) {
    logger.info(`Reconciliation worker received ${signal} — shutting down…`);
    await reconciliationWorker.close();
    await redis.quit();
    logger.info('Reconciliation worker exited cleanly.');
    process.exit(0);
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT');  });
}

start().catch((err: unknown) => {
  logger.error('Reconciliation worker failed to start', { error: (err as Error).message });
  process.exit(1);
});
