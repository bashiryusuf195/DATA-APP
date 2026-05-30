// src/server.ts
//
// Entry point for the API server process.
// Imports the configured app from app.ts and starts listening on a port.
//
// Startup sequence:
//   1. Log env + port immediately (visible in Railway before anything else runs)
//   2. Start the HTTP server (bind 0.0.0.0 so Railway healthcheck can reach it)
//   3. Verify database connection (non-blocking — server already accepting requests)
//   4. Connect to Redis          (non-blocking — warn and continue if unavailable)
//
// Starting the HTTP server BEFORE dependency checks means /api/v1/health
// responds immediately, satisfying Railway's healthcheck even if DB/Redis
// are still initialising or temporarily unreachable.
//
// Run with:
//   npm run dev    (development — tsx watch, hot reload)
//   npm start      (production  — compiled JS, node dist/server.js)

import fs   from 'fs';
import path from 'path';
import { app }    from './app';
import { config } from './config';
import { db }     from './config/database';
import { redis, isRedisQuotaExceeded } from './config/redis';
import { logger } from './lib/logger';

// ── PDF template preflight ────────────────────────────────────────────────────
// Runs synchronously at module load so missing templates surface immediately
// in Railway deployment logs before any request is served.
const PDF_TEMPLATES_DIR = path.resolve(__dirname, 'modules/transactions/pdf/templates');
for (const tpl of ['NIN Information.png', 'NIN Standard.png', 'NIN Premium.png', 'BVN.png']) {
  const tplPath = path.join(PDF_TEMPLATES_DIR, tpl);
  console.log(`[STARTUP] Template ${fs.existsSync(tplPath) ? 'OK' : 'MISSING'}: ${tplPath}`);
}

// Top-level process safety nets — registered before any async work so nothing
// can slip through before startServer() even runs.
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`[RUNTIME] Unhandled rejection: ${msg}`);
  logger.error('unhandled_rejection', { reason: msg });
});

process.on('uncaughtException', (err: Error) => {
  console.error(`[RUNTIME] Uncaught exception: ${err.message}`);
  logger.error('uncaught_exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

async function startServer(): Promise<void> {
  // ── 1. Immediate startup announcement ────────────────────────────────────────
  // console.log is used in addition to logger so these lines appear in Railway
  // deployment logs even if the logger transports are misconfigured.
  console.log(`[STARTUP] VTU API initialising — NODE_ENV=${config.env} PORT=${config.port} version=${config.appVersion}`);
  logger.info('vtu_api_startup_init', {
    env:              config.env,
    version:          config.appVersion,
    port:             config.port,
    workers_disabled: config.workers.disabled,
  });

  try {
    // ── 2. Start HTTP server ──────────────────────────────────────────────────
    // Bind to 0.0.0.0 (all interfaces) — required for Railway's internal
    // network to reach the service. Default Node.js behaviour (no host arg)
    // binds only to IPv4 localhost, which is unreachable from outside the
    // container.
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[STARTUP] HTTP server listening on 0.0.0.0:${config.port} ✓`);
      logger.info('http_server_started', {
        host:   '0.0.0.0',
        port:   config.port,
        health: `http://0.0.0.0:${config.port}/api/v1/health`,
      });
    });

    // ── 3. Test database connection (non-blocking) ────────────────────────────
    // Server is already accepting requests. DB failures are logged loudly but
    // do not crash the process — /api/v1/health/ready will surface the issue.
    db.raw('SELECT 1')
      .then(() => {
        console.log('[STARTUP] Database connected ✓');
        logger.info('db_connected');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[STARTUP] Database connection failed: ${msg}`);
        logger.error('db_connection_failed', { error: msg });
      });

    // ── 4. Connect Redis (non-blocking) ──────────────────────────────────────
    // lazyConnect: true means we must call connect() explicitly.
    // If Redis is unavailable the server stays up — rate limiting and job
    // queues will degrade gracefully; core routes still respond.
    redis.connect()
      .catch(() => {
        // Ignore "already connected" on hot reload
      })
      .then(() => redis.ping())
      .then(() => {
        console.log('[STARTUP] Redis connected ✓');
        logger.info('redis_connected');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (isRedisQuotaExceeded() || msg.includes('max requests limit exceeded')) {
          console.warn('[STARTUP] Redis quota exceeded — rate limiting and queues unavailable');
          logger.warn('redis_quota_exceeded', {
            error: msg,
            hint:  'Set DISABLE_WORKERS=true or switch to a non-Upstash Redis URL',
          });
        } else {
          console.warn(`[STARTUP] Redis connection failed — continuing without Redis: ${msg}`);
          logger.warn('redis_connection_failed', { error: msg });
        }
      });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    // Order: stop accepting → drain in-flight HTTP → close queue connections
    // → destroy DB pool → close Redis.
    const shutdown = (signal: string) => {
      console.log(`[SHUTDOWN] ${signal} received — shutting down gracefully…`);
      logger.info(`${signal} received — shutting down gracefully…`);

      server.close(async () => {
        logger.info('HTTP server closed — draining queue connections…');

        // Close all BullMQ queue connections held by this process.
        // Workers in the separate worker process handle their own shutdown.
        try {
          const { QUEUE_REGISTRY } = await import('./modules/queue/services/queue-monitor.service');
          await Promise.allSettled(
            Object.values(QUEUE_REGISTRY).map((q) => q.close()),
          );
          logger.info('Queue connections closed.');
        } catch (qErr) {
          logger.warn('Could not close queue connections', { error: (qErr as Error).message });
        }

        await db.destroy();
        await redis.quit();
        console.log('[SHUTDOWN] Server shut down cleanly.');
        logger.info('Server shut down cleanly.');
        process.exit(0);
      });

      // Force-exit after 15 s — gives in-flight jobs a chance to finish.
      setTimeout(() => {
        console.error('[SHUTDOWN] Graceful shutdown timed out — forcing exit.');
        logger.error('Graceful shutdown timed out — forcing exit.');
        process.exit(1);
      }, 15_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack   : undefined;
    console.error(`[STARTUP] Fatal startup error: ${msg}`);
    if (stack) console.error(stack);
    logger.error('startup_fatal', { error: msg, stack });
    process.exit(1);
  }
}

void startServer();
