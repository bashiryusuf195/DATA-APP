import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Full-table date-range scan for admin ledger explorer without wallet_id filter.
  // Without this the planner does a full partition fan-out sorted in memory.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ledger_created_at
    ON wallet_ledger (created_at DESC)
  `);

  // Covering index for the journal batch SUM aggregation query.
  // Allows the GROUP BY ... SUM(amount / signed_amount) to be satisfied
  // from the index without hitting the heap.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ledger_batch_amounts
    ON wallet_ledger (journal_batch_id, entry_type, amount, signed_amount)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_ledger_created_at`);
  await knex.raw(`DROP INDEX IF EXISTS idx_ledger_batch_amounts`);
}
