import type { Knex } from "knex";

// Repair migration: idempotently adds provider-routing columns to service_plans.
// Safe to run even if 20260517000010 already applied some or all of them.
export async function up(knex: Knex): Promise<void> {
  const hasPRIMARY  = await knex.schema.hasColumn("service_plans", "primary_provider_code");
  const hasFALLBACK = await knex.schema.hasColumn("service_plans", "fallback_provider_code");
  const hasPVC      = await knex.schema.hasColumn("service_plans", "provider_variation_code");
  const hasPMETA    = await knex.schema.hasColumn("service_plans", "provider_metadata");

  if (!hasPRIMARY || !hasFALLBACK || !hasPVC || !hasPMETA) {
    await knex.schema.alterTable("service_plans", (table) => {
      if (!hasPRIMARY)  table.string("primary_provider_code",  100).nullable();
      if (!hasFALLBACK) table.string("fallback_provider_code", 100).nullable();
      if (!hasPVC)      table.string("provider_variation_code", 100).nullable();
      if (!hasPMETA)    table.jsonb("provider_metadata").notNullable().defaultTo("{}");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPRIMARY  = await knex.schema.hasColumn("service_plans", "primary_provider_code");
  const hasFALLBACK = await knex.schema.hasColumn("service_plans", "fallback_provider_code");
  const hasPVC      = await knex.schema.hasColumn("service_plans", "provider_variation_code");
  const hasPMETA    = await knex.schema.hasColumn("service_plans", "provider_metadata");

  await knex.schema.alterTable("service_plans", (table) => {
    if (hasPRIMARY)  table.dropColumn("primary_provider_code");
    if (hasFALLBACK) table.dropColumn("fallback_provider_code");
    if (hasPVC)      table.dropColumn("provider_variation_code");
    if (hasPMETA)    table.dropColumn("provider_metadata");
  });
}
