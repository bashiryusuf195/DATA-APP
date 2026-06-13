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

  // Composite index for the analytics hot-path: filters successful purchases
  // by type and sorts/ranges by processed_at.
  // Uses only plain columns so it is always valid regardless of column type.
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS transactions_analytics_idx
      ON transactions (status, type, processed_at)
      WHERE status = 'successful'
  `);

  // NOTE: a DATE_TRUNC('month', processed_at) expression index was intentionally
  // omitted. PostgreSQL requires index expressions to be IMMUTABLE, and DATE_TRUNC
  // on a timestamptz column (timezone-sensitive) does not satisfy that requirement.
  // The analytics queries use TO_CHAR / DATE_TRUNC in the WHERE clause instead,
  // which is correctly covered by the transactions_analytics_idx above.
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS transactions_analytics_idx");
  await knex.schema.alterTable("transactions", (t) => {
    t.dropColumn("selling_price_snapshot");
    t.dropColumn("cost_price_snapshot");
    t.dropColumn("profit_snapshot");
  });
}
