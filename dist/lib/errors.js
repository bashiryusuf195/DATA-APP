"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.NoEligibleProviderError = exports.ProviderError = exports.RateLimitError = exports.DailyLimitExceededError = exports.InvalidTransitionError = exports.InsufficientBalanceError = exports.DuplicateRequestError = exports.NotFoundError = exports.OtpRequiredError = exports.RiskBlockedError = exports.ForbiddenError = exports.InvalidPinError = exports.InvalidTokenError = exports.UnauthorizedError = exports.MissingIdempotencyKeyError = exports.ValidationError = exports.AppError = void 0;
// ── Base class ────────────────────────────────────────────────────────────────
class AppError extends Error {
    message;
    code;
    statusCode;
    meta;
    constructor(message, code, statusCode, meta) {
        super(message);
        this.message = message;
        this.code = code;
        this.statusCode = statusCode;
        this.meta = meta;
        this.name = this.constructor.name;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.AppError = AppError;
// ── 400 Bad Request ───────────────────────────────────────────────────────────
class ValidationError extends AppError {
    constructor(message, meta) {
        super(message, 'VALIDATION_ERROR', 400, meta);
    }
}
exports.ValidationError = ValidationError;
class MissingIdempotencyKeyError extends AppError {
    constructor() {
        super('This endpoint requires an Idempotency-Key header (a UUID v4).', 'MISSING_IDEMPOTENCY_KEY', 400);
    }
}
exports.MissingIdempotencyKeyError = MissingIdempotencyKeyError;
// ── 401 Unauthorized ──────────────────────────────────────────────────────────
class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required.') {
        super(message, 'UNAUTHORIZED', 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class InvalidTokenError extends AppError {
    constructor() {
        super('Your session token is invalid or has expired. Please log in again.', 'INVALID_TOKEN', 401);
    }
}
exports.InvalidTokenError = InvalidTokenError;
class InvalidPinError extends AppError {
    constructor() {
        super('Incorrect transaction PIN.', 'INVALID_PIN', 401);
    }
}
exports.InvalidPinError = InvalidPinError;
// ── 403 Forbidden ─────────────────────────────────────────────────────────────
class ForbiddenError extends AppError {
    constructor(requiredPermission) {
        super('You do not have permission to perform this action.', 'FORBIDDEN', 403, requiredPermission ? { required: requiredPermission } : undefined);
    }
}
exports.ForbiddenError = ForbiddenError;
class RiskBlockedError extends AppError {
    constructor() {
        super('This transaction was blocked by our security system. Contact support if you believe this is an error.', 'RISK_BLOCKED', 403);
    }
}
exports.RiskBlockedError = RiskBlockedError;
class OtpRequiredError extends AppError {
    constructor() {
        super('Additional verification required. An OTP has been sent to your phone.', 'OTP_REQUIRED', 403);
    }
}
exports.OtpRequiredError = OtpRequiredError;
// ── 404 Not Found ─────────────────────────────────────────────────────────────
class NotFoundError extends AppError {
    constructor(resource) {
        super(`${resource} not found.`, 'NOT_FOUND', 404);
    }
}
exports.NotFoundError = NotFoundError;
// ── 409 Conflict ──────────────────────────────────────────────────────────────
class DuplicateRequestError extends AppError {
    constructor() {
        super('This request has already been processed.', 'DUPLICATE_REQUEST', 409);
    }
}
exports.DuplicateRequestError = DuplicateRequestError;
// ── 422 Unprocessable ─────────────────────────────────────────────────────────
class InsufficientBalanceError extends AppError {
    constructor() {
        super('Insufficient wallet balance for this transaction.', 'INSUFFICIENT_BALANCE', 422);
    }
}
exports.InsufficientBalanceError = InsufficientBalanceError;
class InvalidTransitionError extends AppError {
    constructor(from, to) {
        super(`Cannot move transaction from "${from}" to "${to}".`, 'INVALID_STATE_TRANSITION', 422, { from, to });
    }
}
exports.InvalidTransitionError = InvalidTransitionError;
class DailyLimitExceededError extends AppError {
    constructor() {
        super('Daily spending limit reached. Please try again tomorrow.', 'DAILY_LIMIT_EXCEEDED', 422);
    }
}
exports.DailyLimitExceededError = DailyLimitExceededError;
// ── 429 Too Many Requests ─────────────────────────────────────────────────────
class RateLimitError extends AppError {
    constructor() {
        super('Too many requests. Please slow down.', 'RATE_LIMIT_EXCEEDED', 429);
    }
}
exports.RateLimitError = RateLimitError;
// ── 502 Bad Gateway ───────────────────────────────────────────────────────────
class ProviderError extends AppError {
    isRetryable;
    constructor(message, isRetryable, meta) {
        super(message, 'PROVIDER_ERROR', 502, { ...meta, isRetryable });
        this.isRetryable = isRetryable;
    }
}
exports.ProviderError = ProviderError;
class NoEligibleProviderError extends AppError {
    constructor() {
        super('This service is temporarily unavailable. Please try again in a few minutes.', 'NO_ELIGIBLE_PROVIDER', 503);
    }
}
exports.NoEligibleProviderError = NoEligibleProviderError;
// ── 500 Internal ──────────────────────────────────────────────────────────────
class InternalError extends AppError {
    constructor(message = 'An unexpected error occurred.') {
        super(message, 'INTERNAL_ERROR', 500);
    }
}
exports.InternalError = InternalError;
//# sourceMappingURL=errors.js.map