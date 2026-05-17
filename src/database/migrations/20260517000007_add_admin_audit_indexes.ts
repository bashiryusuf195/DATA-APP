import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Full-table date-sorted listing for admin audit log viewer
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_admin_log_created_at
    ON admin_activity_logs (created_at DESC)
  `);

  // Outcome filter (success / failure / partial)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_admin_log_outcome
    ON admin_activity_logs (outcome, created_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_admin_log_created_at`);
  await knex.raw(`DROP INDEX IF EXISTS idx_admin_log_outcome`);
}
