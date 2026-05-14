// ============================================================
// src/errors/WalletError.ts
//
// Typed error hierarchy for the wallet engine.
// All errors carry a machine-readable `code` used by API
// handlers to produce correct HTTP status codes and client
// error payloads without string-matching error messages.
// ============================================================

export type WalletErrorCode =
  | "WALLET_NOT_FOUND"
  | "WALLET_INACTIVE"
  | "WALLET_LOCKED"
  | "INSUFFICIENT_BALANCE"
  | "INVALID_AMOUNT"
  | "CURRENCY_MISMATCH"
  | "JOURNAL_UNBALANCED"
  | "JOURNAL_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "TRANSFER_INVALID"
  | "INTERNAL_ERROR";

export class WalletError extends Error {
  public readonly code: WalletErrorCode;
  public readonly context: Record<string, unknown>;

  constructor(
    code: WalletErrorCode,
    message: string,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.context = context;
    // Maintains proper prototype chain for instanceof checks in transpiled JS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WalletNotFoundError extends WalletError {
  constructor(walletId: string) {
    super("WALLET_NOT_FOUND", `Wallet ${walletId} does not exist`, { walletId });
    this.name = "WalletNotFoundError";
  }
}

export class WalletInactiveError extends WalletError {
  constructor(walletId: string, status: string) {
    super("WALLET_INACTIVE", `Wallet ${walletId} is ${status}`, { walletId, status });
    this.name = "WalletInactiveError";
  }
}

export class WalletLockedError extends WalletError {
  constructor(walletId: string) {
    super(
      "WALLET_LOCKED",
      `Wallet ${walletId} is locked by a concurrent operation — retry shortly`,
      { walletId }
    );
    this.name = "WalletLockedError";
  }
}

export class InsufficientBalanceError extends WalletError {
  constructor(walletId: string, balance: number, requested: number) {
    super(
      "INSUFFICIENT_BALANCE",
      `Wallet ${walletId} has insufficient balance: available=${balance}, requested=${requested}`,
      { walletId, balance, requested }
    );
    this.name = "InsufficientBalanceError";
  }
}

export class InvalidAmountError extends WalletError {
  constructor(amount: number) {
    super("INVALID_AMOUNT", `Amount must be positive, got ${amount}`, { amount });
    this.name = "InvalidAmountError";
  }
}

export class CurrencyMismatchError extends WalletError {
  constructor(walletId: string, walletCurrency: string, requestedCurrency: string) {
    super(
      "CURRENCY_MISMATCH",
      `Wallet ${walletId} is ${walletCurrency} but operation specifies ${requestedCurrency}`,
      { walletId, walletCurrency, requestedCurrency }
    );
    this.name = "CurrencyMismatchError";
  }
}

// Translates a raw PostgreSQL error raised inside our PL/pgSQL
// functions into the appropriate typed WalletError subclass.
export function fromPostgresError(err: unknown): WalletError {
  if (!(err instanceof Error)) {
    return new WalletError("INTERNAL_ERROR", String(err));
  }

  const msg = err.message ?? "";

  if (msg.startsWith("WALLET_NOT_FOUND:"))      return new WalletNotFoundError(extractDetail(msg));
  if (msg.startsWith("WALLET_INACTIVE:"))        return new WalletError("WALLET_INACTIVE", msg);
  if (msg.startsWith("WALLET_LOCKED:"))          return new WalletLockedError(extractDetail(msg));
  if (msg.startsWith("INSUFFICIENT_BALANCE:"))   return new WalletError("INSUFFICIENT_BALANCE", msg);
  if (msg.startsWith("INVALID_AMOUNT:"))         return new WalletError("INVALID_AMOUNT", msg);
  if (msg.startsWith("CURRENCY_MISMATCH:"))      return new WalletError("CURRENCY_MISMATCH", msg);
  if (msg.startsWith("JOURNAL_UNBALANCED:"))     return new WalletError("JOURNAL_UNBALANCED", msg);
  if (msg.startsWith("JOURNAL_INVALID:"))        return new WalletError("JOURNAL_INVALID", msg);
  if (msg.startsWith("TRANSFER_INVALID:"))       return new WalletError("TRANSFER_INVALID", msg);

  // PostgreSQL unique_violation on idempotency_key column
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr.code === "23505" && pgErr.constraint?.includes("idempotency_key")) {
    return new WalletError(
      "IDEMPOTENCY_CONFLICT",
      "A journal with this idempotency key already exists with a different payload"
    );
  }

  return new WalletError("INTERNAL_ERROR", msg);
}

function extractDetail(msg: string): string {
  // Extracts the first UUID-like token from the error message
  const match = msg.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] ?? "unknown";
}
