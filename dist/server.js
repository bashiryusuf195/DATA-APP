"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const logger_1 = require("./lib/logger");
async function startServer() {
    try {
        logger_1.logger.info('Starting VTU API server…', {
            env: config_1.config.env,
            version: config_1.config.appVersion,
        });
        // ── 1. Test database connection ─────────────────────────────────────────
        await database_1.db.raw('SELECT 1');
        logger_1.logger.info('Database connected ✓');
        // ── 2. Connect Redis ────────────────────────────────────────────────────
        // lazyConnect is true so we need an explicit connect() here
        await redis_1.redis.connect().catch(() => {
            // Ignore "already connected" error on hot reload
        });
        logger_1.logger.info('Redis connected ✓');
        // ── 3. Start HTTP server ────────────────────────────────────────────────
        const server = app_1.app.listen(config_1.config.port, () => {
            logger_1.logger.info(`Server listening on port ${config_1.config.port} ✓`, {
                url: `http://localhost:${config_1.config.port}`,
                health: `http://localhost:${config_1.config.port}/api/v1/health`,
            });
        });
        // ── Graceful shutdown ───────────────────────────────────────────────────
        // Finish in-flight requests before closing connections.
        const shutdown = (signal) => {
            logger_1.logger.info(`${signal} received — shutting down gracefully…`);
            server.close(async () => {
                await database_1.db.destroy();
                await redis_1.redis.quit();
                logger_1.logger.info('Server shut down cleanly.');
                process.exit(0);
            });
            // Force-exit if graceful shutdown takes more than 10 seconds
            setTimeout(() => {
                logger_1.logger.error('Graceful shutdown timed out — forcing exit.');
                process.exit(1);
            }, 10_000).unref(); // .unref() so this timer doesn't keep the process alive
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        // Log and exit on unhandled rejections / exceptions
        process.on('unhandledRejection', (reason) => {
            logger_1.logger.error('Unhandled rejection', { reason });
        });
        process.on('uncaughtException', (err) => {
            logger_1.logger.error('Uncaught exception', { error: err.message, stack: err.stack });
            process.exit(1);
        });
    }
    catch (err) {
        logger_1.logger.error('Server failed to start', { error: err.message });
        process.exit(1);
    }
}
void startServer();
//# sourceMappingURL=server.js.map