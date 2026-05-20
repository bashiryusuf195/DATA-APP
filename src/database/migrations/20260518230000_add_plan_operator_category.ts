import type { Knex } from "knex";

// Additive migration: network_operator, plan_category, duration_days on service_plans.
// Idempotent — uses hasColumn guards so it is safe to run more than once.
export async function up(knex: Knex): Promise<void> {
  const hasOperator = await knex.schema.hasColumn("service_plans", "network_operator");
  const hasCategory = await knex.schema.hasColumn("service_plans", "plan_category");
  const hasDuration = await knex.schema.hasColumn("service_plans", "duration_days");

  if (!hasOperator || !hasCategory || !hasDuration) {
    await knex.schema.alterTable("service_plans", (table) => {
      // e.g. 'mtn' | 'airtel' | 'glo' | '9mobile' | 'dstv' | 'gotv' | 'ekedc' | etc.
      if (!hasOperator) table.string("network_operator", 100).nullable();
      // e.g. 'sme' | 'corporate' | 'gifting' | 'direct' | 'dnd' | 'social'
      if (!hasCategory) table.string("plan_category", 100).nullable();
      // null = unlimited / variable duration
      if (!hasDuration) table.integer("duration_days").nullable();
    });
  }

  // Add indexes if they don't exist yet (raw SQL, safe with IF NOT EXISTS)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_sp_network_operator ON service_plans (network_operator)
    WHERE network_operator IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_sp_plan_category ON service_plans (plan_category)
    WHERE plan_category IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_sp_service_operator_cat
    ON service_plans (service_id, network_operator, plan_category)
    WHERE is_active = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_sp_network_operator`);
  await knex.raw(`DROP INDEX IF EXISTS idx_sp_plan_category`);
  await knex.raw(`DROP INDEX IF EXISTS idx_sp_service_operator_cat`);

  const hasOperator = await knex.schema.hasColumn("service_plans", "network_operator");
  const hasCategory = await knex.schema.hasColumn("service_plans", "plan_category");
  const hasDuration = await knex.schema.hasColumn("service_plans", "duration_days");

  await knex.schema.alterTable("service_plans", (table) => {
    if (hasOperator) table.dropColumn("network_operator");
    if (hasCategory) table.dropColumn("plan_category");
    if (hasDuration) table.dropColumn("duration_days");
  });
}
