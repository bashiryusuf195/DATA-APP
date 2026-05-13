// src/server.ts
//
// Entry point for the API server process.
// Imports the configured app from app.ts and starts listening on a port.
//
// Startup sequence:
//   1. Load + validate all env vars (crashes early if anything is missing)
//   2. Test the database connection
//   3. Connect to Redis
//   4. Start the HTTP server
//
// Run with:
//   npm run dev    (development — tsx watch, hot reload)
//   npm start      (production  — compiled JS)

import { app }    from './app';
import { config } from './config';
import { db }     from './config/database';
import { redis }  from './config/redis';
import { logger } from './lib/logger';

async function startServer(): Promise<void> {
  try {
    logger.info('Starting VTU API server…', {
      env:     config.env,
      version: config.appVersion,
    });

    // ── 1. Test database connection ─────────────────────────────────────────
    await db.raw('SELECT 1');
    logger.info('Database connected ✓');

    // ── 2. Connect Redis ────────────────────────────────────────────────────
    // lazyConnect is true so we need an explicit connect() here
    await redis.connect().catch(() => {
      // Ignore "already connected" error on hot reload
    });
    logger.info('Redis connected ✓');

    // ── 3. Start HTTP server ────────────────────────────────────────────────
    const server = app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port} ✓`, {
        url:    `http://localhost:${config.port}`,
        health: `http://localhost:${config.port}/api/v1/health`,
      });
    });

    // ── Graceful shutdown ───────────────────────────────────────────────────
    // Finish in-flight requests before closing connections.
    const shutdown = (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully…`);

      server.close(async () => {
        await db.destroy();
        await redis.quit();
        logger.info('Server shut down cleanly.');
        process.exit(0);
      });

      // Force-exit if graceful shutdown takes more than 10 seconds
      setTimeout(() => {
        logger.error('Graceful shutdown timed out — forcing exit.');
        process.exit(1);
      }, 10_000).unref(); // .unref() so this timer doesn't keep the process alive
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    // Log and exit on unhandled rejections / exceptions
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled rejection', { reason });
    });
    process.on('uncaughtException', (err: Error) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

  } catch (err) {
  console.error('FULL STARTUP ERROR:', err);

  logger.error('Server failed to start', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  process.exit(1);
}
}

void startServer();
