// src/workers/integrity-only.ts
//
// Standalone entry point for the integrity-check worker only.
// Use this when you want to run the daily integrity checker as a dedicated
// Railway service rather than bundling it with all workers in workers/index.ts.
//
// Run (prod):  node dist/workers/integrity-only.js
// Run (dev):   tsx src/workers/integrity-only.ts

import '../config/index';
import { logger } from '../lib/logger';
import { redis }  from '../config/redis';
import { config } from '../config';

if (config.workers.disabled) {
  logger.info('DISABLE_WORKERS=true — integrity worker skipped.');
  process.exit(0);
}

import { integrityWorker } from '../modules/backup/workers/integrity.worker';

async function start() {
  logger.info('Integrity worker starting…', {
    env:     config.env,
    version: config.appVersion,
    queue:   'integrity-checks',
    schedule: '02:00 AM daily',
  });

  await redis.connect().catch(() => {
    // ioredis lazyConnect: ignore if already connected
  });
  logger.info('Redis connected (integrity worker)');

  logger.info('Integrity worker ready — daily check scheduled at 02:00 AM.');

  async function shutdown(signal: string) {
    logger.info(`Integrity worker received ${signal} — shutting down…`);
    await integrityWorker.close();
    await redis.quit();
    logger.info('Integrity worker exited cleanly.');
    process.exit(0);
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT');  });
}

start().catch((err: unknown) => {
  logger.error('Integrity worker failed to start', { error: (err as Error).message });
  process.exit(1);
});
