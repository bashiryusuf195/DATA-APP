import type { Knex } from "knex";

// The TypeScript AuditAction type grew to include values that were never added
// to the Postgres audit_action enum, causing constraint violations on every
// token_refresh, 2FA event, and transaction_pin operation.
//
// ALTER TYPE ... ADD VALUE cannot be executed with parameterized placeholders
// ($1, ?, etc.) — PostgreSQL rejects them for DDL. Values must be string
// literals in the SQL text itself. All values here are hardcoded constants
// so direct interpolation is safe (no user input involved).
//
// ALTER TYPE ... ADD VALUE cannot run inside a Knex-managed transaction.
export const config = { transaction: false };

const MISSING_VALUES = [
  "register",
  "token_refresh",
  "session_revoked",
  "2fa_enabled",
  "2fa_disabled",
  "2fa_challenge",
  "2fa_login_success",
  "2fa_login_failure",
  "transaction_pin_set",
  "transaction_pin_changed",
  "transaction_pin_removed",
  "transaction_pin_reset",
] as const;

export async function up(knex: Knex): Promise<void> {
  for (const value of MISSING_VALUES) {
    // Literal interpolation required — Postgres does not accept $1 placeholders
    // in ALTER TYPE ... ADD VALUE. Values are compile-time constants; no injection risk.
    await knex.raw(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${value}'`);
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Postgres does not support removing enum values without recreating the type.
  // Leave the values in place — they are additive and harmless.
}
