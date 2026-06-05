import type { Knex } from "knex";

// The TypeScript AuditAction type grew to include values that were never added
// to the Postgres audit_action enum, causing constraint violations on every
// token_refresh, 2FA event, and transaction_pin operation.
//
// ALTER TYPE ... ADD VALUE is transactional in Postgres 12+ but cannot be
// executed inside a transaction block. Knex wraps migrations in a transaction
// by default, so we disable that here.
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
    await knex.raw(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS ?`, [value]);
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Postgres does not support removing enum values without recreating the type.
  // Leave the values in place — they are additive and harmless.
}
