import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("transactions", (t) => {
    // Snapshot of the price charged to the customer at purchase time.
    // Equals transaction.amount for fixed-price plans.
    t.decimal("selling_price_snapshot", 18, 2).nullable().defaultTo(null);

    // Snapshot of the provider's cost price at purchase time.
    // Priority: provider_plan_mappings.provider_cost_price →
    //           service_plans.cost_price → NULL (unknown).
    t.decimal("cost_price_snapshot", 18, 2).nullable().defaultTo(null);

    // selling_price_snapshot − cost_price_snapshot.
    // NULL when cost price is unknown (cannot compute profit).
    t.decimal("profit_snapshot", 18, 2).nullable().defaultTo(null);
  });

  // Composite index for the analytics query hot-path:
  // successful purchase transactions filtered and sorted by processed_at.
  await knex.schema.raw(`
    CREATE INDEX transactions_analytics_idx
      ON transactions (status, type, processed_at)
      WHERE status = 'successful'
  `);

  // Index for month-bucketed daily breakdown queries.
  await knex.schema.raw(`
    CREATE INDEX transactions_processed_month_idx
      ON transactions (DATE_TRUNC('month', processed_at))
      WHERE status = 'successful'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS transactions_analytics_idx");
  await knex.schema.raw("DROP INDEX IF EXISTS transactions_processed_month_idx");
  await knex.schema.alterTable("transactions", (t) => {
    t.dropColumn("selling_price_snapshot");
    t.dropColumn("cost_price_snapshot");
    t.dropColumn("profit_snapshot");
  });
}
