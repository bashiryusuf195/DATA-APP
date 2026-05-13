"use strict";
// src/middleware/rateLimiter.ts
//
// Three rate-limit tiers used across the app:
//
//   standardLimiter     — applied globally to all routes (60 req / min per user)
//   strictLimiter       — auth and payment routes (10 req / min per IP)
//   transactionLimiter  — POST /transactions (30 req / min per user)
//
// Key is the authenticated user's ID when available, otherwise the IP.
// This stops one user from affecting another's limits.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionLimiter = exports.strictLimiter = exports.standardLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("../config");
// Reusable handler so the response format matches our global error shape
function makeHandler(retryAfterSec) {
    return (_req, res) => {
        res.status(429).json({
            error: 'Too many requests. Please slow down and try again.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: retryAfterSec,
        });
    };
}
// ── Standard: 60 req / min per user (or IP when unauthenticated) ──────────────
exports.standardLimiter = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimit.windowMs,
    max: config_1.config.rateLimit.max,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    handler: makeHandler(Math.ceil(config_1.config.rateLimit.windowMs / 1_000)),
    standardHeaders: true,
    legacyHeaders: false,
});
// ── Strict: 10 req / min per IP (login, registration, payments) ───────────────
exports.strictLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req) => req.ip ?? 'unknown',
    handler: makeHandler(60),
    standardHeaders: true,
    legacyHeaders: false,
});
// ── Transaction: 30 req / min per user ────────────────────────────────────────
exports.transactionLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60_000,
    max: 30,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    handler: makeHandler(60),
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=rateLimiter.js.map