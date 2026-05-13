"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const logger_1 = require("../lib/logger");
const config_1 = require("../config");
// ── Main error handler ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, req, res, next) {
    // ── Our own AppError subclasses ───────────────────────────────────────────
    if (err instanceof errors_1.AppError) {
        if (err.statusCode >= 500) {
            logger_1.logger.error('app_error', {
                code: err.code,
                message: err.message,
                statusCode: err.statusCode,
                traceId: req.traceId,
                path: req.path,
                userId: req.user?.id,
                stack: err.stack,
            });
        }
        else {
            logger_1.logger.warn('client_error', {
                code: err.code,
                message: err.message,
                statusCode: err.statusCode,
                traceId: req.traceId,
                path: req.path,
                userId: req.user?.id,
            });
        }
        res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
            traceId: req.traceId,
            ...(err.meta ? { details: err.meta } : {}),
        });
        return;
    }
    // ── Zod validation errors ─────────────────────────────────────────────────
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            error: 'Request validation failed.',
            code: 'VALIDATION_ERROR',
            traceId: req.traceId,
            details: err.flatten().fieldErrors,
        });
        return;
    }
    // ── Unexpected / unknown errors ───────────────────────────────────────────
    // Always log these in full — something went wrong that we didn't anticipate.
    logger_1.logger.error('unexpected_error', {
        message: err?.message ?? String(err),
        stack: err?.stack,
        traceId: req.traceId,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
    });
    // In development, show the raw error message for easier debugging
    const errMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({
        error: 'An unexpected error occurred. Please try again or contact support.',
        code: 'INTERNAL_ERROR',
        traceId: req.traceId,
        ...(config_1.config.isDev ? { debug: errMessage } : {}),
    });
}
// ── 404 handler ───────────────────────────────────────────────────────────────
// Registered after all routes. Any request that didn't match a route ends here.
function notFoundHandler(req, res) {
    res.status(404).json({
        error: `Route ${req.method} ${req.path} does not exist.`,
        code: 'NOT_FOUND',
    });
}
//# sourceMappingURL=errorHandler.js.map