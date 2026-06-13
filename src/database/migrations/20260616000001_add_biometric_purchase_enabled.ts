import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS biometric_purchase_enabled BOOLEAN NOT NULL DEFAULT false
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS biometric_purchase_enabled
  `)
}
