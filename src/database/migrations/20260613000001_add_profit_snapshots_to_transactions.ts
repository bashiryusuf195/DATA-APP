import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Guard each column so a partially-applied migration can be retried safely.
  const [hasSellingPrice, hasCostPrice, hasProfit] = await Promise.all([
    knex.schema.hasColumn("transactions", "selling_price_snapshot"),
    knex.schema.hasColumn("transactions", "cost_price_snapshot"),
    knex.schema.hasColumn("transactions", "profit_snapshot"),
  ]);

  if (!hasSellingPrice || !hasCostPrice || !hasProfit) {
    await knex.schema.alterTable("transactions", (t) => {
      if (!hasSellingPrice) {
        t.decimal("selling_price_snapshot", 18, 2).nullable().defaultTo(null);
      }
      if (!hasCostPrice) {
        t.decimal("cost_price_snapshot", 18, 2).nullable().defaultTo(null);
      }
      if (!hasProfit) {
        t.decimal("profit_snapshot", 18, 2).nullable().defaultTo(null);
      }
    });
  }

  // CREATE INDEX IF NOT EXISTS is safe to re-run even if the index already exists.
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS transactions_analytics_idx
      ON transactions (status, type, processed_at)
      WHERE status = 'successful'
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS transactions_processed_month_idx
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
