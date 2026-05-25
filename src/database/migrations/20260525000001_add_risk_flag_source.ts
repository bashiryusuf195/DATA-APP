import type { Knex } from "knex";

// Adds a 'source' column to risk_flags so system-generated (automated) flags
// are distinguishable from admin-created ones.
// Values: 'admin' (default, manual) | 'system' (velocity checks, auto-detection)
export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("risk_flags", "source");
  if (!hasCol) {
    await knex.schema.alterTable("risk_flags", (t) => {
      t.string("source", 50).notNullable().defaultTo("admin");
    });
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_risk_flags_source ON risk_flags(source)",
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("risk_flags", "source");
  if (hasCol) {
    await knex.schema.alterTable("risk_flags", (t) => {
      t.dropColumn("source");
    });
  }
}
