// src/middleware/requestLogger.ts
//
// Logs every HTTP request with timing information.
// Assigns a unique traceId to each request so you can trace it through
// all log lines from entry to response.
//
// Skips /health and /ready to avoid log noise.

import { randomUUID }                  from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger }                      from '../lib/logger';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Give this request a unique ID
  const traceId = randomUUID();
  req.traceId   = traceId;

  // Return it in the response so clients can quote it in support tickets
  res.setHeader('X-Trace-Id', traceId);

  const startedAt = Date.now();

  res.on('finish', () => {
    // Don't pollute logs with health-check noise
    if (req.path === '/health' || req.path === '/ready') return;

    const ms = Date.now() - startedAt;

    const meta = {
      traceId,
      method:      req.method,
      path:        req.path,
      statusCode:  res.statusCode,
      ms,
      userId:      req.user?.id,
      ip:          req.ip,
    };

    if      (res.statusCode >= 500) logger.error('http_request', meta);
    else if (res.statusCode >= 400) logger.warn('http_request',  meta);
    else                            logger.info('http_request',  meta);
  });

  next();
}
