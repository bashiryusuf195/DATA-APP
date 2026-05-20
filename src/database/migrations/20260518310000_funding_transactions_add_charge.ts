import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("funding_transactions", (t) => {
    t.string("charge_type", 20).nullable();          // 'flat' | 'percentage' | 'none' | null (legacy)
    t.decimal("charge_value", 20, 4).nullable();     // rate used at time of transaction
    t.decimal("charge_amount", 20, 4).nullable();    // computed fee in NGN
    t.decimal("credited_amount", 20, 4).nullable();  // amount - charge_amount
  });

  // Backfill: existing rows have no charge, so credited_amount = amount
  await knex.raw(`
    UPDATE funding_transactions
    SET
      charge_type   = 'none',
      charge_value  = 0,
      charge_amount = 0,
      credited_amount = amount
    WHERE credited_amount IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("funding_transactions", (t) => {
    t.dropColumn("charge_type");
    t.dropColumn("charge_value");
    t.dropColumn("charge_amount");
    t.dropColumn("credited_amount");
  });
}
