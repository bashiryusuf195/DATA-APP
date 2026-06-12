import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("provider_plan_mappings", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // The customer-facing plan this mapping belongs to
    t.uuid("plan_id")
      .notNullable()
      .references("id")
      .inTable("service_plans")
      .onDelete("CASCADE");

    // Which provider this mapping is for (e.g. "vtpass", "smshika")
    t.text("provider_code").notNullable();

    // The code sent to THIS provider for this plan.
    // May differ from service_plans.provider_variation_code when the same
    // plan is sold through multiple providers using different identifiers.
    t.text("provider_plan_code").notNullable();

    // Provider's cost for this plan — used for loss-protection checks.
    // Null = unknown / not enforced.
    t.decimal("provider_cost_price", 18, 2).nullable().defaultTo(null);

    // Per-provider overrides for fields the provider uses differently.
    t.text("provider_operator").nullable().defaultTo(null);
    t.text("provider_category").nullable().defaultTo(null);

    // Routing priority — lower = tried first. Mirrors provider_configs.priority.
    t.integer("priority").notNullable().defaultTo(100);

    // Whether this mapping is eligible for use.
    // Disabled mappings cause the provider to be skipped (not just warning).
    t.boolean("enabled").notNullable().defaultTo(true);

    // When false: skip this provider if provider_cost_price > customer plan price.
    t.boolean("allow_loss_fallback").notNullable().defaultTo(false);

    // Provider-specific parameters that don't fit standard fields.
    t.jsonb("metadata").notNullable().defaultTo("{}");

    t.timestamps(true, true);
  });

  // Fast lookup during transaction execution
  await knex.schema.raw(`
    CREATE UNIQUE INDEX provider_plan_mappings_plan_provider_uidx
      ON provider_plan_mappings (plan_id, provider_code)
  `);

  await knex.schema.raw(`
    CREATE INDEX provider_plan_mappings_plan_id_idx
      ON provider_plan_mappings (plan_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_plan_mappings");
}
