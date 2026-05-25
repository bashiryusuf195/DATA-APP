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

      if      (res.statusCode >= 500) logger.error('http_request', meta);
      else if (res.statusCode >= 400) logger.warn('http_request',  meta);
      else                            logger.info('http_request',  meta);
    });

    next();
  });
}
