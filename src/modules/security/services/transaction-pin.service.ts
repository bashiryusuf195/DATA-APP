import bcrypt from "bcryptjs";
import { getDbInstance } from "../../../db/knex";
import { redis } from "../../../config/redis";
import {
  TransactionPinNotSetError,
  InvalidTransactionPinError,
  TransactionPinLockedError,
} from "../../../lib/errors";

const db = getDbInstance();

const SALT_ROUNDS   = 10;
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000;  // 15 min in ms
export const RESET_TTL_SEC = 15 * 60;  // 15 min in seconds

// PINs that are trivially guessable: repeated digits, sequential runs.
const WEAK_PINS = new Set([
  "0000","1111","2222","3333","4444","5555","6666","7777","8888","9999",
  "1234","2345","3456","4567","5678","6789","7890",
  "9876","8765","7654","6543","5432","4321","3210","0987",
  "0000","1212","2121","6969","0101",
  "000000","111111","222222","333333","444444","555555",
  "666666","777777","888888","999999",
  "123456","234567","345678","456789","567890",
  "987654","876543","765432","654321","543210","098765",
  "112233","121212","102030",
]);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type PinState = {
  transaction_pin_hash:             string | null;
  transaction_pin_failed_attempts:  number;
  transaction_pin_locked_until:     Date | string | null;
};

async function loadPinState(userId: string): Promise<PinState> {
  return db("users")
    .where({ id: userId })
    .select(
      "transaction_pin_hash",
      "transaction_pin_failed_attempts",
      "transaction_pin_locked_until",
    )
    .first() as Promise<PinState>;
}

function assertNotLocked(state: PinState): void {
  if (!state.transaction_pin_locked_until) return;
  const lockedUntilMs = new Date(state.transaction_pin_locked_until).getTime();
  if (lockedUntilMs > Date.now()) {
    throw new TransactionPinLockedError(Math.ceil((lockedUntilMs - Date.now()) / 1000));
  }
}

async function incrementFailedAttempts(userId: string, current: number): Promise<void> {
  const next       = current + 1;
  const lockUntil  = next >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
  await db("users").where({ id: userId }).update({
    transaction_pin_failed_attempts: next,
    ...(lockUntil ? { transaction_pin_locked_until: lockUntil } : {}),
  });
}

async function clearAttempts(userId: string): Promise<void> {
  await db("users").where({ id: userId }).update({
    transaction_pin_failed_attempts: 0,
    transaction_pin_locked_until:    null,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Hash and persist a new PIN for the user. Clears any lockout. */
export async function persistPin(userId: string, pin: string): Promise<void> {
  const hash = await bcrypt.hash(pin, SALT_ROUNDS);
  await db("users").where({ id: userId }).update({
    transaction_pin_hash:            hash,
    transaction_pin_set_at:          new Date(),
    transaction_pin_failed_attempts: 0,
    transaction_pin_locked_until:    null,
  });
}

/** Remove the PIN entirely. */
export async function removePin(userId: string): Promise<void> {
  await db("users").where({ id: userId }).update({
    transaction_pin_hash:            null,
    transaction_pin_set_at:          null,
    transaction_pin_failed_attempts: 0,
    transaction_pin_locked_until:    null,
  });
}

/**
 * Verify a PIN for a given user.
 * - Throws TransactionPinNotSetError  if no PIN is configured.
 * - Throws TransactionPinLockedError  if account is in lockout.
 * - Throws InvalidTransactionPinError on wrong PIN (also increments counter).
 * - Clears failed-attempt counter on success.
 */
export async function verifyPin(userId: string, pin: string): Promise<void> {
  const state = await loadPinState(userId);

  if (!state?.transaction_pin_hash) {
    throw new TransactionPinNotSetError();
  }

  assertNotLocked(state);

  const valid = await bcrypt.compare(pin, state.transaction_pin_hash);
  if (!valid) {
    await incrementFailedAttempts(userId, state.transaction_pin_failed_attempts ?? 0);
    throw new InvalidTransactionPinError();
  }

  await clearAttempts(userId);
}

/** Returns true if the user has a PIN configured (does NOT check validity). */
export async function hasPinSet(userId: string): Promise<boolean> {
  const row = await db("users")
    .where({ id: userId })
    .select("transaction_pin_hash")
    .first() as { transaction_pin_hash: string | null } | undefined;
  return !!row?.transaction_pin_hash;
}

// ── Redis reset-token helpers ─────────────────────────────────────────────────

function resetKey(userId: string): string {
  return `pin_reset:${userId}`;
}

/** Store a reset token in Redis with TTL. Returns the token. */
export async function storeResetToken(userId: string): Promise<string> {
  const token = Math.floor(100_000 + Math.random() * 900_000).toString();
  await redis.setex(resetKey(userId), RESET_TTL_SEC, token);
  return token;
}

// Atomically retrieves the stored token and deletes it in the same operation.
// Returns 1 if the key existed and was deleted, 0 otherwise.
// This eliminates the GET-check-DEL race window that would allow a token to
// be consumed more than once under concurrent requests.
const LUA_GET_DEL = `
local stored = redis.call('GET', KEYS[1])
if stored == false then return 0 end
redis.call('DEL', KEYS[1])
return stored
`;

/** Validates and consumes a reset token. Throws if invalid/expired. */
export async function consumeResetToken(userId: string, token: string): Promise<void> {
  let stored: unknown;
  try {
    stored = await redis.eval(LUA_GET_DEL, 1, resetKey(userId));
  } catch {
    // Redis unavailable — treat as invalid token (fail closed)
    throw new Error("INVALID_RESET_TOKEN");
  }
  if (!stored || stored !== token) {
    throw new Error("INVALID_RESET_TOKEN");
  }
}
