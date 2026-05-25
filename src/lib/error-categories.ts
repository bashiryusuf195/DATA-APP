// src/lib/error-categories.ts
//
// Standardised error categories for structured logging and monitoring.
// Every error that flows through the global error handler gets one of these
// categories attached so monitoring systems can filter and alert on them.

export type ErrorCategory =
  | 'provider_error'
  | 'auth_error'
  | 'validation_error'
  | 'queue_error'
  | 'reconciliation_error'
  | 'wallet_error'
  | 'webhook_error'
  | 'unknown_error';

// ── Code → category map ───────────────────────────────────────────────────────

const CODE_MAP: Record<string, ErrorCategory> = {
  // Provider
  PROVIDER_ERROR:        'provider_error',
  NO_ELIGIBLE_PROVIDER:  'provider_error',
  PROVIDER_TIMEOUT:      'provider_error',
  PROVIDER_AUTH_FAILED:  'provider_error',
  // Auth
  UNAUTHORIZED:          'auth_error',
  INVALID_TOKEN:         'auth_error',
  FORBIDDEN:             'auth_error',
  INVALID_PIN:           'auth_error',
  RISK_BLOCKED:          'auth_error',
  OTP_REQUIRED:          'auth_error',
  // Validation
  VALIDATION_ERROR:        'validation_error',
  MISSING_IDEMPOTENCY_KEY: 'validation_error',
  DUPLICATE_REQUEST:       'validation_error',
  DUPLICATE_PURCHASE:      'validation_error',
  NOT_FOUND:               'validation_error',
  INVALID_STATE_TRANSITION:'validation_error',
  // Wallet
  INSUFFICIENT_BALANCE:  'wallet_error',
  WALLET_MISMATCH:       'wallet_error',
  DAILY_LIMIT_EXCEEDED:  'wallet_error',
  // Generic
  INTERNAL_ERROR:        'unknown_error',
  RATE_LIMIT_EXCEEDED:   'unknown_error',
};

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Determine the error category from an error code and (optionally) the
 * request path.  Falls back to path-based heuristics before returning
 * 'unknown_error'.
 */
export function categorizeError(code: string, path?: string): ErrorCategory {
  const fromCode = CODE_MAP[code];
  if (fromCode) return fromCode;

  if (path) {
    if (/\/webhook/i.test(path))     return 'webhook_error';
    if (/\/reconcili/i.test(path))   return 'reconciliation_error';
    if (/\/queue/i.test(path))       return 'queue_error';
    if (/\/wallet/i.test(path))      return 'wallet_error';
    if (/\/auth/i.test(path))        return 'auth_error';
    if (/\/provider/i.test(path))    return 'provider_error';
  }

  return 'unknown_error';
}
