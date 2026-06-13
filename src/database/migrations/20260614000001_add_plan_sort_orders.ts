import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Add plan_sort_order column to service_plans
  const hasPlanSortOrder = await knex.schema.hasColumn("service_plans", "plan_sort_order");
  if (!hasPlanSortOrder) {
    await knex.schema.alterTable("service_plans", (t) => {
      t.integer("plan_sort_order").notNullable().defaultTo(0);
    });
  }

  // 2. Create category sort-order table
  const hasTable = await knex.schema.hasTable("service_plan_category_orders");
  if (!hasTable) {
    await knex.schema.createTable("service_plan_category_orders", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("service_type", 100).notNullable();
      t.string("network_operator", 100).nullable();
      t.string("plan_category", 100).notNullable();
      t.integer("sort_order").notNullable().defaultTo(0);
      t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
    });

    // COALESCE in index so NULL network_operators compare equal for uniqueness
    await knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_orders_unique
        ON service_plan_category_orders (service_type, COALESCE(network_operator, ''), plan_category)
    `);
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_cat_orders_lookup
        ON service_plan_category_orders (service_type, network_operator)
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_plan_category_orders");

  const hasPlanSortOrder = await knex.schema.hasColumn("service_plans", "plan_sort_order");
  if (hasPlanSortOrder) {
    await knex.schema.alterTable("service_plans", (t) => {
      t.dropColumn("plan_sort_order");
    });
  }
}
