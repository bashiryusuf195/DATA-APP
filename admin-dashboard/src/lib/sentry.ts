// admin-dashboard/src/lib/sentry.ts
// Call initSentry() at the very top of main.tsx before React renders.
// No-ops gracefully when VITE_SENTRY_DSN is not set.

import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:              import.meta.env.MODE,
    tracesSampleRate:         0.05,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.replayIntegration(),
    ],
  });
}

export { Sentry };
