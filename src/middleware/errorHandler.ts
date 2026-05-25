// src/middleware/errorHandler.ts
//
// Global error handler — the last middleware registered in app.ts.
// Every next(err) call in the application ends up here.
//
// Responsibilities:
//   1. Categorise the error (provider_error, auth_error, wallet_error, …)
//   2. Log the error at the appropriate severity with full context
//   3. Report unexpected errors via the errorReporter (Sentry-ready)
//   4. Send a clean, consistent JSON response — never leak internals to clients
//
// IMPORTANT: Express identifies error-handling middleware by its 4-parameter
// signature. All four params must be present even if next is unused.

import { Request, Response, NextFunction } from 'express';
import { ZodError }           from 'zod';
import { AppError }           from '../lib/errors';
import { logger }             from '../lib/logger';
import { config }             from '../config';
import { categorizeError }    from '../lib/error-categories';
import { errorReporter }      from '../lib/error-reporter';

export function errorHandler(
  err:   unknown,
  req:   Request,
  res:   Response,
  // Express requires exactly 4 parameters to recognise this as an error handler.
  // The parameter is intentionally unused — the underscore prefix tells TS/ESLint.
  _next: NextFunction,
): void {

  // ── AppError (all typed errors: validation, auth, provider, wallet, …) ────
  if (err instanceof AppError) {
    const category = categorizeError(err.code, req.path);

    if (err.statusCode >= 500) {
      logger.error('app_error', {
        error_category: category,
        code:           err.code,
        message:        err.message,
        status_code:    err.statusCode,
        request_id:     req.traceId,
        path:           req.path,
        method:         req.method,
        user_id:        req.user?.id,
        stack:          err.stack,
      });
      errorReporter.captureError(err, {
        errorCategory: category,
        requestId:     req.traceId,
        userId:        req.user?.id,
        path:          req.path,
        method:        req.method,
        statusCode:    err.statusCode,
      });
    } else {
      logger.warn('client_error', {
        error_category: category,
        code:           err.code,
        message:        err.message,
        status_code:    err.statusCode,
        request_id:     req.traceId,
        path:           req.path,
        method:         req.method,
        user_id:        req.user?.id,
      });
    }

    res.status(err.statusCode).json({
      success:  false,
      code:     err.code,
      message:  err.message,
      traceId:  req.traceId,
      ...(err.meta ? { details: err.meta } : {}),
    });
    return;
  }

  // ── Zod validation errors ─────────────────────────────────────────────────
  if (err instanceof ZodError) {
    logger.warn('validation_error', {
      error_category: 'validation_error',
      request_id:     req.traceId,
      path:           req.path,
      method:         req.method,
      user_id:        req.user?.id,
      issues:         err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });

    res.status(400).json({
      success: false,
      code:    'VALIDATION_ERROR',
      message: 'Request validation failed.',
      traceId: req.traceId,
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // ── Unknown / unexpected errors ───────────────────────────────────────────
  const unknownErr = err instanceof Error ? err : new Error(String(err));
  const category   = categorizeError('INTERNAL_ERROR', req.path);

  logger.error('unexpected_error', {
    error_category: category,
    message:        unknownErr.message,
    stack:          unknownErr.stack,
    request_id:     req.traceId,
    path:           req.path,
    method:         req.method,
    user_id:        req.user?.id,
  });

  errorReporter.captureError(unknownErr, {
    errorCategory: category,
    requestId:     req.traceId,
    userId:        req.user?.id,
    path:          req.path,
    method:        req.method,
    statusCode:    500,
  });

  res.status(500).json({
    success: false,
    code:    'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again or contact support.',
    traceId: req.traceId,
    ...(config.isDev ? { debug: unknownErr.message } : {}),
  });
}

// ── 404 handler ───────────────────────────────────────────────────────────────
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    code:    'NOT_FOUND',
    message: `Route ${req.method} ${req.path} does not exist.`,
  });
}
