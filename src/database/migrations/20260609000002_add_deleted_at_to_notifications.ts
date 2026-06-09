import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("notifications", (t) => {
    t.timestamp("deleted_at").nullable().defaultTo(null);
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_notifications_deleted_at
      ON notifications (deleted_at)
      WHERE deleted_at IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_notifications_deleted_at");
  await knex.schema.alterTable("notifications", (t) => {
    t.dropColumn("deleted_at");
  });
}
