// src/instrument.ts
// Import this as the FIRST module in server.ts so Sentry patches Node internals
// before any other code runs.
//
// No-ops gracefully when SENTRY_DSN is not set (local dev, CI, etc.).

import * as Sentry from '@sentry/node';
import { registerAdapter } from './lib/error-reporter';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:      process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.05,
  });

  registerAdapter({
    captureError(err, ctx) {
      Sentry.withScope((scope) => {
        if (ctx.userId)    scope.setUser({ id: String(ctx.userId) });
        if (ctx.requestId) scope.setTag('request_id', String(ctx.requestId));
        if (ctx.path)      scope.setTag('path', String(ctx.path));
        scope.setExtras(ctx as Record<string, unknown>);
        Sentry.captureException(err);
      });
    },
    captureMessage(message, level, ctx) {
      Sentry.withScope((scope) => {
        if (ctx.userId) scope.setUser({ id: String(ctx.userId) });
        scope.setExtras(ctx as Record<string, unknown>);
        Sentry.captureMessage(message, level as Sentry.SeverityLevel);
      });
    },
  });
}
