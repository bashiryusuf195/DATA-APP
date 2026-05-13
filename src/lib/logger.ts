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

import winston from 'winston';
import { config } from '../config';

// ── Format for development (pretty, coloured) ─────────────────────────────────
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }: {
    timestamp?: string;
    level:      string;
    message:    unknown;
    [key: string]: unknown;
  }) => {
    const metaStr = Object.keys(meta).length
      ? '\n  ' + JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')
      : '';
    return `${timestamp} [${level}] ${String(message)}${metaStr}`;
  }),
);

// ── Format for production (structured JSON) ───────────────────────────────────
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level:  config.logLevel,
  format: config.isDev ? devFormat : prodFormat,
  defaultMeta: {
    service: config.appName,
    version: config.appVersion,
    env:     config.env,
  },
  transports: [
    new winston.transports.Console(),
  ],
});
