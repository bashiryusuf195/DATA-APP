import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("announcements", (t) => {
    t.string("severity", 20).notNullable().defaultTo("info").after("message");
  });

  await knex.raw(`
    ALTER TABLE announcements
      ADD CONSTRAINT announcements_severity_check
        CHECK (severity IN ('info', 'success', 'warning', 'critical'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE announcements
      DROP CONSTRAINT IF EXISTS announcements_severity_check
  `);
  await knex.schema.alterTable("announcements", (t) => {
    t.dropColumn("severity");
  });
}
