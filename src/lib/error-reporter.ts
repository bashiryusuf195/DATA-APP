// src/lib/error-reporter.ts
//
// Centralised error reporting abstraction.
//
// The default adapter writes to Winston. Plug in Sentry, BetterStack, or
// Datadog at startup by calling registerAdapter() — all registered adapters
// receive every event, so you can fan-out to multiple services simultaneously.
//
// Adding Sentry (example — install @sentry/node first):
//   import * as Sentry from '@sentry/node';
//   Sentry.init({ dsn: process.env.SENTRY_DSN });
//   registerAdapter({
//     captureError:   (err, ctx) => Sentry.captureException(err, { extra: ctx }),
//     captureMessage: (msg, lvl, ctx) => Sentry.captureMessage(msg, { level: lvl, extra: ctx }),
//   });
//
// Adding BetterStack Logs (example):
//   import Logtail from '@logtail/node';
//   const logtail = new Logtail(process.env.BETTERSTACK_TOKEN!);
//   registerAdapter({
//     captureError:   (err, ctx) => void logtail.error(err.message, { error: err.stack, ...ctx }),
//     captureMessage: (msg, lvl, ctx) => void logtail[lvl](msg, ctx),
//   });

import { logger } from './logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ErrorContext {
  userId?:          string;
  requestId?:       string;
  transactionRef?:  string;
  providerCode?:    string;
  errorCategory?:   string;
  path?:            string;
  method?:          string;
  statusCode?:      number;
  [key: string]:    unknown;
}

export interface ErrorReporterAdapter {
  captureError(err: Error, context: ErrorContext): void;
  captureMessage(
    message: string,
    level:   'info' | 'warning' | 'error',
    context: ErrorContext,
  ): void;
}

// ── Default adapter: Winston ──────────────────────────────────────────────────

const loggerAdapter: ErrorReporterAdapter = {
  captureError(err, context) {
    logger.error('captured_error', {
      error:   err.message,
      stack:   err.stack,
      ...context,
    });
  },
  captureMessage(message, level, context) {
    const fn = level === 'info' ? 'info' : level === 'warning' ? 'warn' : 'error';
    logger[fn]('captured_message', { message, ...context });
  },
};

// ── Adapter registry ──────────────────────────────────────────────────────────

const _adapters: ErrorReporterAdapter[] = [loggerAdapter];

/**
 * Register an additional reporting adapter.
 * Call once at startup, after env vars are validated.
 * Each registered adapter receives every error/message event.
 */
export function registerAdapter(adapter: ErrorReporterAdapter): void {
  _adapters.push(adapter);
}

// ── Public reporter ───────────────────────────────────────────────────────────

export const errorReporter = {
  /**
   * Report an unexpected Error.
   * Always use this for 5xx / unhandled errors — adapters forward to Sentry etc.
   */
  captureError(err: Error, context: ErrorContext = {}): void {
    for (const adapter of _adapters) {
      try { adapter.captureError(err, context); } catch { /* never let a reporter crash the app */ }
    }
  },

  /**
   * Report a structured message without a thrown error (e.g. a security alert).
   */
  captureMessage(
    message: string,
    level:   'info' | 'warning' | 'error',
    context: ErrorContext = {},
  ): void {
    for (const adapter of _adapters) {
      try { adapter.captureMessage(message, level, context); } catch { /* silent */ }
    }
  },

  /**
   * Convenience: capture and alert on specific system-level events.
   * These produce a structured log that monitoring dashboards can filter on.
   */
  alert: {
    providerAuthFailed(providerCode: string, context: ErrorContext = {}): void {
      errorReporter.captureMessage('provider_auth_failed', 'error', {
        providerCode,
        alert_type: 'provider_auth_failed',
        ...context,
      });
    },
    providerTimeoutRepeated(providerCode: string, count: number, context: ErrorContext = {}): void {
      errorReporter.captureMessage('provider_timeout_repeated', 'error', {
        providerCode,
        timeout_count: count,
        alert_type: 'provider_timeout_repeated',
        ...context,
      });
    },
    queueBacklogHigh(queueName: string, backlog: number, context: ErrorContext = {}): void {
      errorReporter.captureMessage('queue_backlog_high', 'warning', {
        queue_name: queueName,
        backlog,
        alert_type: 'queue_backlog_high',
        ...context,
      });
    },
    queueFailureSpiked(queueName: string, failedCount: number, context: ErrorContext = {}): void {
      errorReporter.captureMessage('queue_failure_spiked', 'error', {
        queue_name:   queueName,
        failed_count: failedCount,
        alert_type:   'queue_failure_spiked',
        ...context,
      });
    },
    reconciliationBacklog(backlog: number, context: ErrorContext = {}): void {
      errorReporter.captureMessage('reconciliation_backlog_high', 'warning', {
        backlog,
        alert_type: 'reconciliation_backlog_high',
        ...context,
      });
    },
    walletMismatch(walletId: string, expected: number, actual: number, context: ErrorContext = {}): void {
      errorReporter.captureMessage('wallet_balance_mismatch', 'error', {
        wallet_id: walletId,
        expected,
        actual,
        delta:      actual - expected,
        alert_type: 'wallet_balance_mismatch',
        ...context,
      });
    },
    dbConnectionFailed(error: string, context: ErrorContext = {}): void {
      errorReporter.captureMessage('db_connection_failed', 'error', {
        error,
        alert_type: 'db_connection_failed',
        ...context,
      });
    },
    redisConnectionFailed(error: string, context: ErrorContext = {}): void {
      errorReporter.captureMessage('redis_connection_failed', 'error', {
        error,
        alert_type: 'redis_connection_failed',
        ...context,
      });
    },

    // Fires when a webhook job (Paystack/Squad) exhausts all retries without
    // crediting the user's wallet. Requires manual reconciliation.
    webhookCreditFailed(
      gateway:   string,
      reference: string,
      error:     string,
      context:   ErrorContext = {},
    ): void {
      errorReporter.captureMessage('webhook_credit_failed', 'error', {
        gateway,
        reference,
        error,
        alert_type:  'webhook_credit_failed',
        severity:    'critical',   // user paid but wallet not credited
        ...context,
      });
    },

    // Fires when a wallet.credit() call fails inside any funding path.
    walletCreditFailed(
      userId:    string,
      reference: string,
      amount:    number,
      error:     string,
      context:   ErrorContext = {},
    ): void {
      errorReporter.captureMessage('wallet_credit_failed', 'error', {
        user_id:    userId,
        reference,
        amount,
        error,
        alert_type: 'wallet_credit_failed',
        ...context,
      });
    },

    // Fires when a provider's purchase failure rate crosses a threshold.
    purchaseFailureSpike(
      providerCode:   string,
      failureCount:   number,
      windowMinutes:  number,
      context:        ErrorContext = {},
    ): void {
      errorReporter.captureMessage('purchase_failure_spike', 'error', {
        provider_code:  providerCode,
        failure_count:  failureCount,
        window_minutes: windowMinutes,
        alert_type:     'purchase_failure_spike',
        ...context,
      });
    },

    // Fires when the 5xx error rate exceeds a threshold in a rolling window.
    repeated500Errors(
      count:         number,
      windowMinutes: number,
      samplePath?:   string,
      context:       ErrorContext = {},
    ): void {
      errorReporter.captureMessage('repeated_500_errors', 'error', {
        count,
        window_minutes: windowMinutes,
        sample_path:    samplePath ?? null,
        alert_type:     'repeated_500_errors',
        ...context,
      });
    },

    // Fires when a BullMQ job reaches its final failed state (no retries left).
    failedQueueJob(
      queueName: string,
      jobId:     string | undefined,
      error:     string,
      attempts:  number,
      context:   ErrorContext = {},
    ): void {
      errorReporter.captureMessage('failed_queue_job', 'error', {
        queue_name: queueName,
        job_id:     jobId ?? 'unknown',
        error,
        attempts,
        alert_type: 'failed_queue_job',
        ...context,
      });
    },
  },
};
