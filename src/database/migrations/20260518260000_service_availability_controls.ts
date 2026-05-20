import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("service_availability_controls");

  if (!hasTable) {
    await knex.schema.createTable("service_availability_controls", (table) => {
      table.uuid("id").primary();
      table.string("service_type", 100).notNullable();
      table.string("network_operator", 100).notNullable();
      // NULL = network-level; non-NULL = specific category under that network
      table.string("plan_category", 100).nullable();
      table.boolean("is_active").notNullable().defaultTo(true);
      table.text("reason").nullable();
      table.uuid("updated_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      table.timestamps(true, true);
    });
  }

  // One row per (service_type, network_operator) at the network level
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_sac_network
    ON service_availability_controls (service_type, network_operator)
    WHERE plan_category IS NULL
  `);

  // One row per (service_type, network_operator, plan_category) at the category level
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_sac_category
    ON service_availability_controls (service_type, network_operator, plan_category)
    WHERE plan_category IS NOT NULL
  `);

  // Fast lookup of blocked entries during customer-facing plan queries
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_sac_blocked
    ON service_availability_controls (service_type, network_operator, plan_category)
    WHERE is_active = false
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_sac_blocked`);
  await knex.raw(`DROP INDEX IF EXISTS uidx_sac_category`);
  await knex.raw(`DROP INDEX IF EXISTS uidx_sac_network`);
  await knex.schema.dropTableIfExists("service_availability_controls");
}
