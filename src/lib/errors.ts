// src/lib/errors.ts
//
// Every possible error in the platform has its own class here.
// This means the global error handler always knows:
//   - what HTTP status to send (statusCode)
//   - what machine-readable code to include (code)
//   - what human-readable message to show (message)
//
// Pattern:
//   throw new InsufficientBalanceError();
//   → errorHandler sends: 422  { error: '...', code: 'INSUFFICIENT_BALANCE' }
//
// Usage anywhere:
//   import { NotFoundError } from '../lib/errors';
//   if (!user) throw new NotFoundError('User');

// ── Base class ────────────────────────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly message:    string,
    public readonly code:       string,
    public readonly statusCode: number,
    public readonly meta?:      Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ── 400 Bad Request ───────────────────────────────────────────────────────────
export class ValidationError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, meta);
  }
}

export class MissingIdempotencyKeyError extends AppError {
  constructor() {
    super(
      'This endpoint requires an Idempotency-Key header (a UUID v4).',
      'MISSING_IDEMPOTENCY_KEY',
      400,
    );
  }
}

// ── 401 Unauthorized ──────────────────────────────────────────────────────────
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class InvalidTokenError extends AppError {
  constructor() {
    super(
      'Your session token is invalid or has expired. Please log in again.',
      'INVALID_TOKEN',
      401,
    );
  }
}

export class InvalidPinError extends AppError {
  constructor() {
    super('Incorrect transaction PIN.', 'INVALID_PIN', 401);
  }
}

export class InvalidTransactionPinError extends AppError {
  constructor() {
    super('Incorrect transaction PIN.', 'INVALID_TRANSACTION_PIN', 401);
  }
}

// ── 403 Forbidden ─────────────────────────────────────────────────────────────
export class ForbiddenError extends AppError {
  constructor(requiredPermission?: string) {
    super(
      'You do not have permission to perform this action.',
      'FORBIDDEN',
      403,
      requiredPermission ? { required: requiredPermission } : undefined,
    );
  }
}

export class RiskBlockedError extends AppError {
  constructor() {
    super(
      'This transaction was blocked by our security system. Contact support if you believe this is an error.',
      'RISK_BLOCKED',
      403,
    );
  }
}

export class OtpRequiredError extends AppError {
  constructor() {
    super(
      'Additional verification required. An OTP has been sent to your phone.',
      'OTP_REQUIRED',
      403,
    );
  }
}

// ── 404 Not Found ─────────────────────────────────────────────────────────────
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found.`, 'NOT_FOUND', 404);
  }
}

// ── 409 Conflict ──────────────────────────────────────────────────────────────
export class DuplicateRequestError extends AppError {
  constructor() {
    super(
      'This request has already been processed.',
      'DUPLICATE_REQUEST',
      409,
    );
  }
}

// ── 422 Unprocessable ─────────────────────────────────────────────────────────
export class TransactionPinRequiredError extends AppError {
  constructor() {
    super(
      'A transaction PIN is required to complete this action.',
      'TRANSACTION_PIN_REQUIRED',
      422,
    );
  }
}

export class TransactionPinNotSetError extends AppError {
  constructor() {
    super(
      'You have not set up a transaction PIN. Visit Security → Transaction PIN to set one before making purchases.',
      'TRANSACTION_PIN_NOT_SET',
      422,
    );
  }
}

export class InsufficientBalanceError extends AppError {
  constructor() {
    super(
      'Insufficient wallet balance for this transaction.',
      'INSUFFICIENT_BALANCE',
      422,
    );
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(
      `Cannot move transaction from "${from}" to "${to}".`,
      'INVALID_STATE_TRANSITION',
      422,
      { from, to },
    );
  }
}

export class DailyLimitExceededError extends AppError {
  constructor() {
    super(
      'Daily spending limit reached. Please try again tomorrow.',
      'DAILY_LIMIT_EXCEEDED',
      422,
    );
  }
}

// ── 429 Too Many Requests ─────────────────────────────────────────────────────
export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests. Please slow down.', 'RATE_LIMIT_EXCEEDED', 429);
  }
}

export class TransactionPinLockedError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(
      `Too many incorrect PIN attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      'TRANSACTION_PIN_LOCKED',
      429,
      { retry_after_seconds: retryAfterSeconds },
    );
  }
}

// ── 502 Bad Gateway ───────────────────────────────────────────────────────────
export class ProviderError extends AppError {
  constructor(
    message: string,
    public readonly isRetryable: boolean,
    meta?: Record<string, unknown>,
  ) {
    super(message, 'PROVIDER_ERROR', 502, { ...meta, isRetryable });
  }
}

export class NoEligibleProviderError extends AppError {
  constructor() {
    super(
      'This service is temporarily unavailable. Please try again in a few minutes.',
      'NO_ELIGIBLE_PROVIDER',
      503,
    );
  }
}

// ── 500 Internal ──────────────────────────────────────────────────────────────
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred.') {
    super(message, 'INTERNAL_ERROR', 500);
  }
}
