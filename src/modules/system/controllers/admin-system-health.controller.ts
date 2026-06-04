// src/modules/system/controllers/admin-system-health.controller.ts
//
// Aggregates all system health signals into a single admin endpoint.
// Powers the Operations → System Health dashboard page.
//
// GET /admin/system-health
//
// Returns:
//   uptime_seconds    — server uptime in seconds
//   database          — DB reachability + query latency
//   redis             — Redis reachability
//   queues            — BullMQ queue depths + failure counts
//   providers         — Provider circuit-breaker status
//   timestamp

import type { Request, Response, NextFunction } from 'express';
import { db }                          from '../../../config/database';
import { checkRedisHealth }            from '../../../config/redis';
import { config }                      from '../../../config';
import { logger }                      from '../../../lib/logger';
import { errorReporter }               from '../../../lib/error-reporter';
import { getAllQueueStats }             from '../../queue/services/queue-monitor.service';
import { getProviderHealthDashboard }  from '../../providers/services/provider-health-dashboard.service';

// Capture the time this module was first loaded as the process start proxy
const PROCESS_START = Date.now();

export async function getSystemHealthController(
  _req:  Request,
  res:   Response,
  next:  NextFunction,
): Promise<void> {
  try {
    // Run all health checks in parallel — never let one block another
    const [dbResult, redisOk, queues, providers] = await Promise.allSettled([
      // DB: measure latency
      (async () => {
        const start = Date.now();
        await db.raw('SELECT 1');
        return { ok: true, latency_ms: Date.now() - start };
      })(),
      // Redis
      checkRedisHealth(),
      // Queues
      getAllQueueStats(),
      // Providers
      getProviderHealthDashboard({ window: '1h' }),
    ]);

    // ── Database ─────────────────────────────────────────────────────────────
    let database: { status: 'ok' | 'degraded'; latency_ms: number | null };
    if (dbResult.status === 'fulfilled') {
      database = { status: 'ok', latency_ms: dbResult.value.latency_ms };
    } else {
      const errMsg = (dbResult.reason as Error)?.message ?? 'unknown';
      logger.error('system_health_db_failed', { error: errMsg });
      errorReporter.alert.dbConnectionFailed(errMsg);
      database = { status: 'degraded', latency_ms: null };
    }

    // ── Redis ─────────────────────────────────────────────────────────────────
    const redisStatus = redisOk.status === 'fulfilled' && redisOk.value ? 'ok' : 'degraded';
    if (redisStatus === 'degraded') {
      const errMsg = redisOk.status === 'rejected'
        ? (redisOk.reason as Error)?.message ?? 'unknown'
        : 'PING returned false';
      errorReporter.alert.redisConnectionFailed(errMsg);
    }

    // ── Queues ────────────────────────────────────────────────────────────────
    let queueSummary: {
      status:        'ok' | 'degraded' | 'error';
      total_waiting: number;
      total_active:  number;
      total_failed:  number;
      queue_count:   number;
      queues:        Array<{
        name:    string;
        waiting: number;
        active:  number;
        failed:  number;
        delayed: number;
        paused:  boolean;
        oldest_waiting_age_ms: number | null;
      }>;
    };

    if (queues.status === 'fulfilled') {
      const qs = queues.value;
      const totalWaiting = qs.reduce((s, q) => s + q.waiting, 0);
      const totalFailed  = qs.reduce((s, q) => s + q.failed,  0);
      const totalActive  = qs.reduce((s, q) => s + q.active,  0);

      // Emit alerts for high-backlog and failure spikes
      for (const q of qs) {
        if (q.waiting > 500)  errorReporter.alert.queueBacklogHigh(q.name, q.waiting);
        if (q.failed  > 50)   errorReporter.alert.queueFailureSpiked(q.name, q.failed);
      }
      if (qs.some((q) => q.name === 'reconciliation' && q.waiting > 20)) {
        errorReporter.alert.reconciliationBacklog(qs.find((q) => q.name === 'reconciliation')!.waiting);
      }

      queueSummary = {
        status:        totalFailed > 100 || totalWaiting > 1000 ? 'degraded' : 'ok',
        total_waiting: totalWaiting,
        total_active:  totalActive,
        total_failed:  totalFailed,
        queue_count:   qs.length,
        queues:        qs.map((q) => ({
          name:    q.name,
          waiting: q.waiting,
          active:  q.active,
          failed:  q.failed,
          delayed: q.delayed,
          paused:  q.paused,
          oldest_waiting_age_ms: q.oldest_waiting_age_ms,
        })),
      };
    } else {
      logger.error('system_health_queues_failed', { error: (queues.reason as Error)?.message });
      queueSummary = { status: 'error', total_waiting: 0, total_active: 0, total_failed: 0, queue_count: 0, queues: [] };
    }

    // ── Providers ─────────────────────────────────────────────────────────────
    let providerSummary: {
      status:    'ok' | 'degraded' | 'error';
      healthy:   number;
      degraded:  number;
      down:      number;
      providers: Array<{
        code:                  string;
        name:                  string;
        computed_health:       string;
        circuit_open:          boolean;
        consecutive_failures:  number;
        success_rate:          number | null;
        last_failure_at:       string | null;
        recent_failure_reason: string | null;
      }>;
    };

    if (providers.status === 'fulfilled') {
      const ps = providers.value;
      const healthy  = ps.filter((p) => p.computed_health === 'healthy').length;
      const degraded = ps.filter((p) => p.computed_health === 'degraded').length;
      const down     = ps.filter((p) => p.computed_health === 'down').length;

      for (const p of ps) {
        if (p.circuit_open && p.consecutive_failures >= 5) {
          errorReporter.alert.providerTimeoutRepeated(p.provider_code, p.consecutive_failures);
        }
      }

      providerSummary = {
        status:    down > 0 ? 'degraded' : degraded > 0 ? 'degraded' : 'ok',
        healthy,
        degraded,
        down,
        providers: ps.map((p) => ({
          code:                  p.provider_code,
          name:                  p.name,
          computed_health:       p.computed_health,
          circuit_open:          p.circuit_open,
          consecutive_failures:  p.consecutive_failures,
          success_rate:          p.success_rate,
          last_failure_at:       p.last_failure_at,
          recent_failure_reason: p.recent_failure_reason,
        })),
      };
    } else {
      logger.error('system_health_providers_failed', { error: (providers.reason as Error)?.message });
      providerSummary = { status: 'error', healthy: 0, degraded: 0, down: 0, providers: [] };
    }

    // ── Payment gateway config (key presence only — never the values) ─────────
    const paymentGateways = {
      paystack: {
        configured:         Boolean(config.paystack.secretKey),
        base_url:           config.paystack.baseUrl,
        has_webhook_secret: Boolean(config.paystack.webhookSecret),
        has_callback_url:   Boolean(config.paystack.callbackUrl),
      },
      squad: {
        configured:         Boolean(config.squad.secretKey),
        base_url:           config.squad.baseUrl,
        has_webhook_secret: Boolean(config.squad.webhookSecret),
        has_callback_url:   Boolean(config.squad.callbackUrl),
      },
    };

    // ── Overall status ────────────────────────────────────────────────────────
    const overallOk =
      database.status === 'ok' &&
      redisStatus     === 'ok' &&
      queueSummary.status !== 'error' &&
      providerSummary.status !== 'error';

    res.status(200).json({
      success: true,
      data: {
        status:           overallOk ? 'ok' : 'degraded',
        uptime_seconds:   Math.floor((Date.now() - PROCESS_START) / 1000),
        version:          process.env.APP_VERSION ?? 'unknown',
        commit_sha:       process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? 'unknown',
        database,
        redis:            { status: redisStatus },
        queues:           queueSummary,
        providers:        providerSummary,
        payment_gateways: paymentGateways,
        timestamp:        new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}
