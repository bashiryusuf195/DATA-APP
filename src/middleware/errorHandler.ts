// src/middleware/errorHandler.ts
//
// Global error handler — the last middleware registered in app.ts.
// Every `next(err)` call in the application ends up here.
//
// Responsibilities:
//   1. Log the error (severity depends on error type)
//   2. Send a clean, consistent JSON response
//   3. Never leak stack traces or internal details to clients
//
// IMPORTANT: Express recognises error-handling middleware by its
// 4-parameter signature. All four parameters must be present even if
// `next` is unused — removing any of them breaks error handling.

import { Request, Response, NextFunction } from 'express';
import { ZodError }  from 'zod';
import { AppError }  from '../lib/errors';
import { logger }    from '../lib/logger';
import { config }    from '../config';

// ── Main error handler ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err:  unknown,
  req:  Request,
  res:  Response,
  next: NextFunction,
): void {

  // ── Our own AppError (and all subclasses, including shared/errors/AppError) ──
  // shared/errors/AppError extends this class, so instanceof works for both.
  if (err instanceof AppError) {
    // Auth errors (4xx) are expected — log as warning, not error.
    if (err.statusCode >= 500) {
      logger.error('app_error', {
        code:       err.code,
        message:    err.message,
        statusCode: err.statusCode,
        traceId:    req.traceId,
        path:       req.path,
        userId:     req.user?.id,
        stack:      err.stack,
      });
    } else {
      logger.warn('client_error', {
        code:       err.code,
        message:    err.message,
        statusCode: err.statusCode,
        traceId:    req.traceId,
        path:       req.path,
        userId:     req.user?.id,
      });
    }

    res.status(err.statusCode).json({
      success: false,
      code:    err.code,
      message: err.message,
      traceId: req.traceId,
      ...(err.meta ? { details: err.meta } : {}),
    });
    return;
  }

  // ── Zod validation errors ─────────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      code:    'VALIDATION_ERROR',
      message: 'Request validation failed.',
      traceId: req.traceId,
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // ── Unexpected / unknown errors ───────────────────────────────────────────
  // Always log these in full — something went wrong that we didn't anticipate.
  logger.error('unexpected_error', {
    message: (err as Error)?.message ?? String(err),
    stack:   (err as Error)?.stack,
    traceId: req.traceId,
    path:    req.path,
    method:  req.method,
    userId:  req.user?.id,
  });

  res.status(500).json({
    success: false,
    code:    'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again or contact support.',
    traceId: req.traceId,
    ...(config.isDev ? { debug: (err instanceof Error ? err.message : String(err)) } : {}),
  });
}

// ── 404 handler ───────────────────────────────────────────────────────────────
// Registered after all routes. Any request that didn't match a route ends here.
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    code:    'NOT_FOUND',
    message: `Route ${req.method} ${req.path} does not exist.`,
  });
}
