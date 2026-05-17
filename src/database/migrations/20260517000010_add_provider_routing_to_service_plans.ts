import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("service_plans", (table) => {
    // Plan-level provider routing overrides.
    // When set, these take precedence over service-type routing rules.
    table.string("primary_provider_code", 100).nullable();
    table.string("fallback_provider_code", 100).nullable();
    // The variation code as the provider expects it (may differ from our internal code).
    table.string("provider_variation_code", 100).nullable();
    table.jsonb("provider_metadata").notNullable().defaultTo("{}");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("service_plans", (table) => {
    table.dropColumn("primary_provider_code");
    table.dropColumn("fallback_provider_code");
    table.dropColumn("provider_variation_code");
    table.dropColumn("provider_metadata");
  });
}
