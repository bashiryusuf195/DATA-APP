import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("provider_attempts", "error_classification");
  if (!hasColumn) {
    await knex.schema.alterTable("provider_attempts", (table) => {
      table.text("error_classification").nullable().after("error_message");
    });
  }

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_pa_error_class ON provider_attempts (error_classification)"
  );
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("provider_attempts", "error_classification");
  if (hasColumn) {
    await knex.schema.alterTable("provider_attempts", (table) => {
      table.dropColumn("error_classification");
    });
  }
}
