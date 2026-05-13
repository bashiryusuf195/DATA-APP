"use strict";
// src/middleware/idempotency.ts
//
// Prevents duplicate processing when a client retries a request
// (e.g. network timeout, double-tap on a "Pay" button).
//
// How it works:
//   1. Client sends a UUID in the "Idempotency-Key" header
//   2. First request → processed normally; response cached in Redis (24 h)
//   3. Duplicate request (same key) → cached response returned immediately,
//      zero DB writes, zero provider calls
//
// The key is scoped to the user ID so user A cannot replay user B's keys.
//
// Usage — add to any mutation that must not run twice:
//   router.post('/transactions',
//     authenticate,
//     requireIdempotencyKey,
//     transactionController.create,
//   );
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireIdempotencyKey = requireIdempotencyKey;
const redis_1 = require("../config/redis");
const errors_1 = require("../lib/errors");
const logger_1 = require("../lib/logger");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_SECS = 86_400; // 24 hours
async function requireIdempotencyKey(req, res, next) {
    const raw = req.headers['idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    // ── 1. Key must be present ────────────────────────────────────────────────
    if (!key) {
        return next(new errors_1.MissingIdempotencyKeyError());
    }
    // ── 2. Key must be a valid UUID v4 ────────────────────────────────────────
    if (!UUID_RE.test(key)) {
        return next({
            statusCode: 400,
            code: 'INVALID_IDEMPOTENCY_KEY',
            message: 'Idempotency-Key must be a valid UUID v4.',
        });
    }
    // ── 3. Scope to user (or "anon" for unauthenticated routes) ──────────────
    const scope = req.user?.id ?? 'anon';
    const cacheKey = `idem:${scope}:${key}`;
    // ── 4. Check for a cached response ────────────────────────────────────────
    const cached = await (0, redis_1.cacheGet)(cacheKey);
    if (cached) {
        logger_1.logger.info('idempotency.replayed', { key, scope });
        res.set('X-Idempotent-Replayed', 'true');
        res.status(cached.status).json(cached.body);
        return; // stop here — do not call next()
    }
    // ── 5. Intercept res.json() to save the response after it's sent ──────────
    const originalJson = res.json.bind(res);
    res.json = function (body) {
        (0, redis_1.cacheSet)(cacheKey, { status: res.statusCode, body }, TTL_SECS).catch(() => {
            // Non-fatal: if we can't cache the response the endpoint still works,
            // it just won't be idempotent for this particular key.
            logger_1.logger.warn('idempotency.cache_write_failed', { key });
        });
        return originalJson(body);
    };
    next();
}
//# sourceMappingURL=idempotency.js.map