export declare class AppError extends Error {
    readonly message: string;
    readonly code: string;
    readonly statusCode: number;
    readonly meta?: Record<string, unknown> | undefined;
    constructor(message: string, code: string, statusCode: number, meta?: Record<string, unknown> | undefined);
}
export declare class ValidationError extends AppError {
    constructor(message: string, meta?: Record<string, unknown>);
}
export declare class MissingIdempotencyKeyError extends AppError {
    constructor();
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class InvalidTokenError extends AppError {
    constructor();
}
export declare class InvalidPinError extends AppError {
    constructor();
}
export declare class ForbiddenError extends AppError {
    constructor(requiredPermission?: string);
}
export declare class RiskBlockedError extends AppError {
    constructor();
}
export declare class OtpRequiredError extends AppError {
    constructor();
}
export declare class NotFoundError extends AppError {
    constructor(resource: string);
}
export declare class DuplicateRequestError extends AppError {
    constructor();
}
export declare class InsufficientBalanceError extends AppError {
    constructor();
}
export declare class InvalidTransitionError extends AppError {
    constructor(from: string, to: string);
}
export declare class DailyLimitExceededError extends AppError {
    constructor();
}
export declare class RateLimitError extends AppError {
    constructor();
}
export declare class ProviderError extends AppError {
    readonly isRetryable: boolean;
    constructor(message: string, isRetryable: boolean, meta?: Record<string, unknown>);
}
export declare class NoEligibleProviderError extends AppError {
    constructor();
}
export declare class InternalError extends AppError {
    constructor(message?: string);
}
