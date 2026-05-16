import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("provider_routing_rules");

  if (!exists) {
    await knex.schema.createTable("provider_routing_rules", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      // One active rule per service_type enforced at the application layer;
      // the DB allows multiple rows to support rule history / drafts.
      table.text("service_type").notNullable();
      table.text("primary_provider_code").notNullable();
      table.text("fallback_provider_code").nullable();
      table.boolean("is_active").notNullable().defaultTo(true);
      table.jsonb("metadata").notNullable().defaultTo("{}");
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_prr_service_type ON provider_routing_rules (service_type)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_prr_is_active ON provider_routing_rules (is_active)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_prr_primary_provider ON provider_routing_rules (primary_provider_code)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_prr_service_active ON provider_routing_rules (service_type, is_active)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_routing_rules");
}
