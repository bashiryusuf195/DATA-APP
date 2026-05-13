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

import { Router, Request, Response } from 'express';
import { checkDatabaseHealth }        from '../config/database';
import { checkRedisHealth }           from '../config/redis';
import { config }                     from '../config';

export const healthRouter = Router();

// ── Liveness ──────────────────────────────────────────────────────────────────
healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status:    'ok',
    service:   config.appName,
    version:   config.appVersion,
    env:       config.env,
    timestamp: new Date().toISOString(),
  });
});

// ── Readiness ─────────────────────────────────────────────────────────────────
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const allOk = dbOk && redisOk;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks: {
      database: dbOk    ? 'ok' : 'unreachable',
      redis:    redisOk ? 'ok' : 'unreachable',
    },
    timestamp: new Date().toISOString(),
  });
});
