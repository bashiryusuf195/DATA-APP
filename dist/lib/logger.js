"use strict";
// src/lib/logger.ts
//
// Structured logger using Winston.
//
// Development  → colourised, human-readable text
// Production   → JSON (one object per line — easy to parse in Grafana / Datadog)
//
// Every log line gets three automatic fields:
//   service  — app name
//   version  — app version
//   env      — "development" | "production" | "staging"
//
// Usage (anywhere in the codebase):
//   import { logger } from '../lib/logger';
//   logger.info('user_login',   { userId: '123', ip: '1.2.3.4' });
//   logger.warn('high_risk',    { userId: '123', score: 72 });
//   logger.error('db_failure',  { error: err.message, query: sql });
//   logger.debug('cache_hit',   { key: 'catalog:services' });
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../config");
// ── Format for development (pretty, coloured) ─────────────────────────────────
const devFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
        ? '\n  ' + JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')
        : '';
    return `${timestamp} [${level}] ${String(message)}${metaStr}`;
}));
// ── Format for production (structured JSON) ───────────────────────────────────
const prodFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
exports.logger = winston_1.default.createLogger({
    level: config_1.config.logLevel,
    format: config_1.config.isDev ? devFormat : prodFormat,
    defaultMeta: {
        service: config_1.config.appName,
        version: config_1.config.appVersion,
        env: config_1.config.env,
    },
    transports: [
        new winston_1.default.transports.Console(),
    ],
});
//# sourceMappingURL=logger.js.map