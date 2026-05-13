"use strict";
// src/app.ts
//
// Configures and exports the Express application.
// Kept separate from server.ts so tests can import the app
// without binding to a port.
//
// Middleware order matters — each layer runs in the order it is registered:
//   1. Security headers  (helmet)
//   2. CORS
//   3. Body parsing
//   4. Request logger    (assigns traceId)
//   5. Rate limiter
//   6. Routes
//   7. 404 handler       (after all routes)
//   8. Error handler     (must be very last)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const routes_1 = require("./routes");
const requestLogger_1 = require("./middleware/requestLogger");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
exports.app = (0, express_1.default)();
// ── 1. Security headers ───────────────────────────────────────────────────────
// Sets X-Frame-Options, X-XSS-Protection, Strict-Transport-Security, etc.
exports.app.use((0, helmet_1.default)());
// ── 2. CORS ───────────────────────────────────────────────────────────────────
// Only allows requests from the origins listed in CORS_ORIGINS.
exports.app.use((0, cors_1.default)({
    origin: config_1.config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));
// ── 3. Body parsing ───────────────────────────────────────────────────────────
// Parse JSON request bodies. Limit to 1 MB to block oversized payloads.
exports.app.use(express_1.default.json({ limit: '1mb' }));
// ── 4. Request logger ─────────────────────────────────────────────────────────
exports.app.use(requestLogger_1.requestLogger);
// ── 5. Rate limiter ───────────────────────────────────────────────────────────
exports.app.use(rateLimiter_1.standardLimiter);
// ── 6. Routes ─────────────────────────────────────────────────────────────────
exports.app.use('/api/v1', routes_1.rootRouter);
// ── 7. 404 handler ───────────────────────────────────────────────────────────
// Must come AFTER all routes so it only fires if nothing else matched.
exports.app.use(errorHandler_1.notFoundHandler);
// ── 8. Error handler ──────────────────────────────────────────────────────────
// Must be the LAST middleware registered.
// Express identifies error handlers by their 4-parameter signature.
exports.app.use(errorHandler_1.errorHandler);
//# sourceMappingURL=app.js.map