import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS totp_secret       TEXT,
      ADD COLUMN IF NOT EXISTS totp_enabled      BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[]
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS totp_secret,
      DROP COLUMN IF EXISTS totp_enabled,
      DROP COLUMN IF EXISTS totp_backup_codes
  `);
}
