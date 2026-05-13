"use strict";
// src/routes/health.routes.ts
//
// Two endpoints used by load balancers and container orchestrators:
//
//   GET /api/v1/health  — liveness check: "is the process alive?"
//                         Returns 200 immediately. No DB or Redis calls.
//                         Load balancers call this every few seconds.
//
//   GET /api/v1/ready   — readiness check: "is the app ready for traffic?"
//                         Checks DB + Redis before returning 200.
//                         Container orchestrators use this before sending traffic.
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const database_1 = require("../config/database");
const redis_1 = require("../config/redis");
const config_1 = require("../config");
exports.healthRouter = (0, express_1.Router)();
// ── Liveness ──────────────────────────────────────────────────────────────────
exports.healthRouter.get('/', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: config_1.config.appName,
        version: config_1.config.appVersion,
        env: config_1.config.env,
        timestamp: new Date().toISOString(),
    });
});
// ── Readiness ─────────────────────────────────────────────────────────────────
exports.healthRouter.get('/ready', async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([
        (0, database_1.checkDatabaseHealth)(),
        (0, redis_1.checkRedisHealth)(),
    ]);
    const allOk = dbOk && redisOk;
    res.status(allOk ? 200 : 503).json({
        status: allOk ? 'ok' : 'degraded',
        checks: {
            database: dbOk ? 'ok' : 'unreachable',
            redis: redisOk ? 'ok' : 'unreachable',
        },
        timestamp: new Date().toISOString(),
    });
});
//# sourceMappingURL=health.routes.js.map