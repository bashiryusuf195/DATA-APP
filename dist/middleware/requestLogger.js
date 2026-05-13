"use strict";
// src/middleware/requestLogger.ts
//
// Logs every HTTP request with timing information.
// Assigns a unique traceId to each request so you can trace it through
// all log lines from entry to response.
//
// Skips /health and /ready to avoid log noise.
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const crypto_1 = require("crypto");
const logger_1 = require("../lib/logger");
function requestLogger(req, res, next) {
    // Give this request a unique ID
    const traceId = (0, crypto_1.randomUUID)();
    req.traceId = traceId;
    // Return it in the response so clients can quote it in support tickets
    res.setHeader('X-Trace-Id', traceId);
    const startedAt = Date.now();
    res.on('finish', () => {
        // Don't pollute logs with health-check noise
        if (req.path === '/health' || req.path === '/ready')
            return;
        const ms = Date.now() - startedAt;
        const meta = {
            traceId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            ms,
            userId: req.user?.id,
            ip: req.ip,
        };
        if (res.statusCode >= 500)
            logger_1.logger.error('http_request', meta);
        else if (res.statusCode >= 400)
            logger_1.logger.warn('http_request', meta);
        else
            logger_1.logger.info('http_request', meta);
    });
    next();
}
//# sourceMappingURL=requestLogger.js.map