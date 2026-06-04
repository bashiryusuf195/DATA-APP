// src/routes/health.routes.ts
//
// Health-check endpoints used by load balancers, container orchestrators,
// and the admin monitoring dashboard.
//
//  GET /api/v1/health            — liveness:  "is the process alive?"
//  GET /api/v1/health/ready      — readiness: "is the app ready for traffic?" (DB + Redis)
//  GET /api/v1/health/database   — DB latency measurement (public, minimal details)
//  GET /api/v1/health/queues     — BullMQ queue backlog summary  (admin-only)
//  GET /api/v1/health/providers  — Provider circuit-breaker summary (admin-only)
//  GET /api/v1/health/build      — Build/deploy info + FIELD_MAP hash  (admin-only)

import { Router, Request, Response } from 'express';
import { createHash }                 from 'crypto';
import { checkDatabaseHealth, db }    from '../config/database';
import { checkRedisHealth }           from '../config/redis';
import { config }                     from '../config';
import { authenticate }               from '../modules/auth/middleware/authenticate';
import { requireRole }                from '../modules/auth/middleware/authorize';
import { logger }                     from '../lib/logger';
import { errorReporter }              from '../lib/error-reporter';
import { FIELD_MAP }                  from '../modules/transactions/pdf/field-map';

export const healthRouter = Router();

const adminGuard = [authenticate, requireRole('admin', 'super_admin')] as const;

// Track server start time for uptime calculation
const SERVER_START = Date.now();

// ── Liveness ──────────────────────────────────────────────────────────────────
// Fast — no external calls. Load balancers hit this every few seconds.
healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status:          'ok',
    service:         config.appName,
    version:         config.appVersion,
    env:             config.env,
    uptime_seconds:  Math.floor((Date.now() - SERVER_START) / 1000),
    timestamp:       new Date().toISOString(),
  });
});

// ── Readiness ─────────────────────────────────────────────────────────────────
// Used by Kubernetes / Docker before routing traffic to this instance.
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  if (!dbOk)    errorReporter.alert.dbConnectionFailed('SELECT 1 failed during readiness check');
  if (!redisOk) errorReporter.alert.redisConnectionFailed('PING failed during readiness check');

  const allOk = dbOk && redisOk;
  res.status(allOk ? 200 : 503).json({
    status:    allOk ? 'ok' : 'degraded',
    checks: {
      database: dbOk    ? 'ok' : 'unreachable',
      redis:    redisOk ? 'ok' : 'unreachable',
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Database latency ──────────────────────────────────────────────────────────
// Public endpoint — infrastructure tooling (Prometheus exporters, etc.)
// Only returns status + latency, never internal details.
healthRouter.get('/database', async (_req: Request, res: Response) => {
  const start = Date.now();
  let status: 'ok' | 'degraded' = 'ok';
  let latency_ms: number | null = null;
  let error: string | undefined;

  try {
    await db.raw('SELECT 1');
    latency_ms = Date.now() - start;
  } catch (err) {
    status     = 'degraded';
    latency_ms = Date.now() - start;
    error      = (err as Error).message;
    logger.error('health_check_db_failed', { error, latency_ms });
    errorReporter.alert.dbConnectionFailed(error);
  }

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    latency_ms,
    ...(error && config.isDev ? { error } : {}),
    timestamp: new Date().toISOString(),
  });
});

// ── Queue health ──────────────────────────────────────────────────────────────
// Admin-only — reveals internal queue depths and failure counts.
healthRouter.get('/queues', ...adminGuard, async (_req: Request, res: Response) => {
  try {
    const { getAllQueueStats } = await import('../modules/queue/services/queue-monitor.service');
    const queues = await getAllQueueStats();

    const totalWaiting = queues.reduce((s, q) => s + q.waiting, 0);
    const totalFailed  = queues.reduce((s, q) => s + q.failed,  0);
    const totalActive  = queues.reduce((s, q) => s + q.active,  0);

    // Alert if any queue has a large backlog or failure spike
    for (const q of queues) {
      if (q.waiting > 500) {
        errorReporter.alert.queueBacklogHigh(q.name, q.waiting);
      }
      if (q.failed > 50) {
        errorReporter.alert.queueFailureSpiked(q.name, q.failed);
      }
    }

    const hasIssue = totalFailed > 0 || queues.some((q) => q.waiting > 500);
    res.status(200).json({
      status: hasIssue ? 'degraded' : 'ok',
      summary: {
        total_waiting: totalWaiting,
        total_active:  totalActive,
        total_failed:  totalFailed,
        queue_count:   queues.length,
      },
      queues: queues.map((q) => ({
        name:    q.name,
        waiting: q.waiting,
        active:  q.active,
        failed:  q.failed,
        delayed: q.delayed,
        paused:  q.paused,
        oldest_waiting_age_ms: q.oldest_waiting_age_ms,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('health_check_queues_failed', { error: (err as Error).message });
    res.status(503).json({ status: 'error', message: 'Queue stats unavailable', timestamp: new Date().toISOString() });
  }
});

// ── Provider health ───────────────────────────────────────────────────────────
// Admin-only — reveals provider circuit-breaker state.
healthRouter.get('/providers', ...adminGuard, async (_req: Request, res: Response) => {
  try {
    const { getProviderHealthDashboard } = await import('../modules/providers/services/provider-health-dashboard.service');
    const providers = await getProviderHealthDashboard({ window: '1h' });

    const summary = {
      healthy:  providers.filter((p) => p.computed_health === 'healthy').length,
      degraded: providers.filter((p) => p.computed_health === 'degraded').length,
      down:     providers.filter((p) => p.computed_health === 'down').length,
    };

    // Alert on auth failures (providers with repeated auth errors)
    for (const p of providers) {
      if (p.circuit_open && p.consecutive_failures >= 5) {
        errorReporter.alert.providerTimeoutRepeated(p.provider_code, p.consecutive_failures);
      }
    }

    const overallStatus = summary.down > 0 ? 'degraded' : summary.degraded > 0 ? 'degraded' : 'ok';
    res.status(200).json({
      status: overallStatus,
      summary,
      providers: providers.map((p) => ({
        code:                 p.provider_code,
        name:                 p.name,
        computed_health:      p.computed_health,
        circuit_open:         p.circuit_open,
        consecutive_failures: p.consecutive_failures,
        success_rate:         p.success_rate,
        last_failure_at:      p.last_failure_at,
        recent_failure_reason: p.recent_failure_reason,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('health_check_providers_failed', { error: (err as Error).message });
    res.status(503).json({ status: 'error', message: 'Provider health unavailable', timestamp: new Date().toISOString() });
  }
});

// ── Deep health (admin-only aggregate) ───────────────────────────────────────
// Equivalent to /admin/system-health but mounted under /health for tooling
// that already polls the /health prefix. Includes payment gateway config status.
healthRouter.get('/deep', ...adminGuard, async (_req: Request, res: Response) => {
  const start = Date.now();

  const [dbResult, redisOk, queueResult, providerResult] = await Promise.allSettled([
    (async () => { const t = Date.now(); await db.raw('SELECT 1'); return Date.now() - t; })(),
    checkRedisHealth(),
    import('../modules/queue/services/queue-monitor.service').then((m) => m.getAllQueueStats()),
    import('../modules/providers/services/provider-health-dashboard.service')
      .then((m) => m.getProviderHealthDashboard({ window: '1h' })),
  ]);

  const dbStatus  = dbResult.status  === 'fulfilled' ? 'ok' : 'degraded';
  const redisStatus = (redisOk.status === 'fulfilled' && redisOk.value) ? 'ok' : 'degraded';

  const queueStats = queueResult.status === 'fulfilled' ? queueResult.value : [];
  const providers  = providerResult.status === 'fulfilled' ? providerResult.value : [];

  // Payment gateway config — key presence only, never the key values themselves
  const gateways = {
    paystack: {
      configured:     Boolean(config.paystack.secretKey),
      base_url:       config.paystack.baseUrl,
      has_webhook_secret: Boolean(config.paystack.webhookSecret),
    },
    squad: {
      configured:     Boolean(config.squad.secretKey),
      base_url:       config.squad.baseUrl,
      has_webhook_secret: Boolean(config.squad.webhookSecret),
    },
  };

  const totalFailed  = queueStats.reduce((s, q) => s + q.failed,  0);
  const totalWaiting = queueStats.reduce((s, q) => s + q.waiting, 0);
  const downProviders = providers.filter((p) => p.computed_health === 'down').length;

  const overallStatus =
    dbStatus !== 'ok' || redisStatus !== 'ok' ? 'degraded' :
    totalFailed > 100 || downProviders > 0    ? 'degraded' : 'ok';

  res.status(overallStatus === 'ok' ? 200 : 503).json({
    status:         overallStatus,
    checked_in_ms:  Date.now() - start,
    uptime_seconds: Math.floor((Date.now() - SERVER_START) / 1000),
    database: {
      status:     dbStatus,
      latency_ms: dbResult.status === 'fulfilled' ? dbResult.value : null,
    },
    redis: { status: redisStatus },
    queues: {
      status:        totalFailed > 100 ? 'degraded' : 'ok',
      total_waiting: totalWaiting,
      total_failed:  totalFailed,
      list:          queueStats.map((q) => ({
        name: q.name, waiting: q.waiting, active: q.active, failed: q.failed,
      })),
    },
    providers: {
      status:        downProviders > 0 ? 'degraded' : 'ok',
      healthy:       providers.filter((p) => p.computed_health === 'healthy').length,
      degraded:      providers.filter((p) => p.computed_health === 'degraded').length,
      down:          downProviders,
    },
    payment_gateways: gateways,
    timestamp: new Date().toISOString(),
  });
});

// ── Build / deploy info ───────────────────────────────────────────────────────
// Admin-only — reveals git commit, FIELD_MAP hash, and key PDF coordinates.
// Use this to confirm Railway is running the latest calibrated build without
// needing SSH access.  Compare calibrated: true / field_map_hash across envs.
healthRouter.get('/build', ...adminGuard, (_req: Request, res: Response) => {
  const fieldMapHash = createHash('sha256')
    .update(JSON.stringify(FIELD_MAP))
    .digest('hex')
    .slice(0, 16);

  const ninStd = FIELD_MAP['nin_standard'];
  const ninPrm = FIELD_MAP['nin_premium'];
  const bvn    = FIELD_MAP['bvn_basic'];

  const calibrated =
    ninStd.fields['last_name'].y === 0.264 &&
    bvn.fields['last_name'].y    === 0.320 &&
    ninPrm.fields['id_number'].y === 0.270;

  // Snapshot the key coords that changed in the calibration commit (ef7f1e9).
  // Stale build: nin_std_last_name_y=0.225, bvn_last_name_y=0.143
  // Calibrated : nin_std_last_name_y=0.264, bvn_last_name_y=0.320
  const coordinates = {
    nin_standard: {
      W: ninStd.W, H: ninStd.H,
      last_name_y:     ninStd.fields['last_name'].y,
      given_names_y:   ninStd.fields['given_names'].y,
      date_of_birth_y: ninStd.fields['date_of_birth'].y,
      id_number_y:     ninStd.fields['id_number'].y,
      photo:           ninStd.photo,
    },
    nin_premium: {
      W: ninPrm.W, H: ninPrm.H,
      last_name_y:     ninPrm.fields['last_name'].y,
      given_names_y:   ninPrm.fields['given_names'].y,
      date_of_birth_y: ninPrm.fields['date_of_birth'].y,
      id_number_y:     ninPrm.fields['id_number'].y,
      photo:           ninPrm.photo,
    },
    bvn_basic: {
      W: bvn.W, H: bvn.H,
      first_name_y:    bvn.fields['first_name'].y,
      last_name_y:     bvn.fields['last_name'].y,
      date_of_birth_y: bvn.fields['date_of_birth'].y,
      bvn_y:           bvn.fields['bvn'].y,
      photo:           bvn.photo,
    },
  };

  res.json({
    commit_sha:     process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['COMMIT_SHA'] ?? 'unknown',
    deployment_id:  process.env['RAILWAY_DEPLOYMENT_ID'] ?? 'unknown',
    app_version:    config.appVersion,
    field_map_hash: fieldMapHash,
    calibrated,
    templates:      Object.values(FIELD_MAP).map((t) => t.templateFile),
    coordinates,
    timestamp:      new Date().toISOString(),
  });
});
