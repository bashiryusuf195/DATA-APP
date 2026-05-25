// src/lib/logger.ts
//
// Structured logger (Winston).
//
// Development  → colourised, human-readable text
// Production   → JSON one-object-per-line (Grafana / Datadog / BetterStack)
//
// Automatic fields on every log line:
//   service    — app name
//   version    — app version
//   env        — "development" | "production" | "staging"
//
// When called inside an HTTP request (i.e. after requestLogger middleware),
// these fields are also injected automatically from AsyncLocalStorage:
//   request_id           — X-Request-Id of the current request
//   user_id              — authenticated user (if auth middleware has run)
//   transaction_reference — active transaction reference (if set)
//   provider_code        — active provider (if set)
//
// Secret sanitisation: sensitive field names (password, token, api_key, …)
// are replaced with "[REDACTED]". Phone numbers matching Nigerian patterns
// are masked to show only the last 4 digits.
//
// Usage:
//   logger.info('user_login',    { userId, ip });
//   logger.warn('high_risk',     { userId, score });
//   logger.error('db_failure',   { error: err.message });
//   logger.debug('cache_hit',    { key });

import winston from 'winston';
import { config } from '../config';
import { correlation } from './correlation';

// ── Secret sanitisation ───────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'api_key', 'apikey', 'authorization',
  'credential', 'credentials', 'private_key', 'access_token', 'refresh_token',
  'x_signature', 'webhook_secret', 'encryption_key', 'pin', 'cvv', 'otp',
  'jwt', 'bearer', 'signing_key', 'service_role_key',
]);

// Nigerian mobile number pattern (local and international)
const PHONE_RE = /(\+?234|0)[789]\d{9}/g;

function sanitize(val: unknown, depth = 0): unknown {
  if (depth > 6 || val === null || val === undefined) return val;
  if (typeof val === 'string') return val.replace(PHONE_RE, (m) => `***${m.slice(-4)}`);
  if (Array.isArray(val)) return val.map((v) => sanitize(v, depth + 1));
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return val;
}

// ── Winston formats ───────────────────────────────────────────────────────────

// 1. Inject correlation context from AsyncLocalStorage into every log record.
//    Fields are only set if they are not already present in the log call —
//    explicit call-site values always win over the context store.
const correlationFormat = winston.format((info) => {
  const ctx = correlation.get();
  if (!ctx) return info;
  const i = info as Record<string, unknown>;
  if (ctx.requestId)      i['request_id']            ??= ctx.requestId;
  if (ctx.userId)         i['user_id']               ??= ctx.userId;
  if (ctx.transactionRef) i['transaction_reference'] ??= ctx.transactionRef;
  if (ctx.providerCode)   i['provider_code']         ??= ctx.providerCode;
  return info;
})();

// 2. Redact sensitive field names and mask phone numbers.
//    Skips a small set of known-safe system fields for performance.
const sanitizeFormat = winston.format((info) => {
  const SKIP = new Set(['level', 'message', 'timestamp', 'service', 'version', 'env']);
  for (const key of Object.keys(info)) {
    if (SKIP.has(key)) continue;
    const i = info as Record<string, unknown>;
    i[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : sanitize(i[key]);
  }
  return info;
})();

// ── Development format (colourised, human-readable) ───────────────────────────
const devFormat = winston.format.combine(
  correlationFormat,
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

// ── Production format (structured JSON) ───────────────────────────────────────
const prodFormat = winston.format.combine(
  correlationFormat,
  sanitizeFormat,
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
