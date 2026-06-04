// src/middleware/requestLogger.ts
//
// Logs every HTTP request with timing information and propagates a correlation
// ID through the entire request lifecycle via AsyncLocalStorage.
//
// Correlation ID resolution order:
//   1. Incoming X-Request-Id header (set by an upstream load-balancer or client)
//   2. Freshly generated UUID (for requests that originate directly)
//
// The resolved ID is:
//   - Stored on req.traceId / req.requestId (backward-compat + typed)
//   - Returned as X-Request-Id and X-Trace-Id response headers
//   - Injected into every subsequent logger call automatically (via AsyncLocalStorage)
//
// Health paths (/health, /ready) are skipped to avoid log noise.

import { randomUUID }                      from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger }                          from '../lib/logger';
import { correlation }                     from '../lib/correlation';
import { errorReporter }                   from '../lib/error-reporter';

// ── Rolling 5xx spike detector ────────────────────────────────────────────────
// Uses 1-minute buckets with a 5-minute sliding window.
// Alerts once per SPIKE_THRESHOLD increment to avoid flooding.

const _5xxBuckets     = new Map<number, number>(); // epoch-minute → count
const WINDOW_MINUTES  = 5;
const SPIKE_THRESHOLD = 10;

function track5xxAndAlert(path: string): void {
  const nowMinute = Math.floor(Date.now() / 60_000);

  // Increment current bucket
  _5xxBuckets.set(nowMinute, (_5xxBuckets.get(nowMinute) ?? 0) + 1);

  // Evict stale buckets (keep only the rolling window)
  const cutoff = nowMinute - WINDOW_MINUTES;
  for (const k of _5xxBuckets.keys()) {
    if (k < cutoff) _5xxBuckets.delete(k);
  }

  const total = Array.from(_5xxBuckets.values()).reduce((s, v) => s + v, 0);

  // Alert at every SPIKE_THRESHOLD boundary — prevents duplicate alerts within
  // the same threshold band while still re-alerting on sustained failure.
  if (total >= SPIKE_THRESHOLD && total % SPIKE_THRESHOLD === 0) {
    errorReporter.alert.repeated500Errors(total, WINDOW_MINUTES, path);
  }
}

export function requestLogger(
  req:  Request,
  res:  Response,
  next: NextFunction,
): void {
  // ── Resolve correlation / request ID ─────────────────────────────────────
  const requestId = (req.headers['x-request-id'] as string | undefined) || randomUUID();

  // Backward-compat: controllers and error handler read req.traceId
  req.traceId   = requestId;
  req.requestId = requestId;

  // Return both headers so clients can reference the ID in support tickets
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Trace-Id',   requestId);

  const startedAt = Date.now();

  // ── Run the rest of the request inside the correlation context ────────────
  // AsyncLocalStorage propagates the context automatically through every
  // Promise, timer, and event listener initiated from within this callback,
  // including provider calls, queue enqueues, and reconciliation logic.
  correlation.run({ requestId }, () => {
    res.on('finish', () => {
      // Skip health-check noise
      if (req.path === '/health' || req.path === '/ready' ||
          req.path.startsWith('/health/')) return;

      const ms = Date.now() - startedAt;

      // Enrich correlation context with the resolved user ID (available after
      // the auth middleware has run and populated req.user).
      if (req.user?.id) correlation.set({ userId: req.user.id });

      const meta = {
        request_id:  requestId,
        method:      req.method,
        path:        req.path,
        status_code: res.statusCode,
        ms,
        user_id:     req.user?.id,
        ip:          req.ip,
      };

      if (res.statusCode >= 500) {
        logger.error('http_request', meta);
        track5xxAndAlert(req.path);
      } else if (res.statusCode >= 400) {
        logger.warn('http_request', meta);
      } else {
        logger.info('http_request', meta);
      }
    });

    next();
  });
}
