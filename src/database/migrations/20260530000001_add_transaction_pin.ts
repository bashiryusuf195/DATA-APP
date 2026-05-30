import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS transaction_pin_hash             TEXT,
      ADD COLUMN IF NOT EXISTS transaction_pin_set_at           TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS transaction_pin_failed_attempts  INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS transaction_pin_locked_until     TIMESTAMPTZ
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS transaction_pin_hash,
      DROP COLUMN IF EXISTS transaction_pin_set_at,
      DROP COLUMN IF EXISTS transaction_pin_failed_attempts,
      DROP COLUMN IF EXISTS transaction_pin_locked_until
  `);
}
