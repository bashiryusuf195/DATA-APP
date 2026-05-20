import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("provider_wallet_info", (t) => {
    t.uuid("id").primary();
    t.string("provider_code", 100).notNullable().unique()
      .references("provider_code").inTable("provider_configs").onDelete("CASCADE");

    // Funding bank details (for topping up the provider wallet)
    t.string("funding_bank_name",       200).nullable();
    t.string("funding_account_number",  50).nullable();
    t.string("funding_account_name",    200).nullable();

    // Balance tracking
    t.decimal("wallet_balance",         20, 4).nullable();
    t.string("balance_currency",        10).notNullable().defaultTo("NGN");
    t.decimal("low_balance_threshold",  20, 4).nullable();

    // Last check metadata
    t.timestamp("last_balance_check_at", { useTz: true }).nullable();
    // 'ok' | 'low' | 'unknown' | 'error'
    t.string("balance_check_status",    20).notNullable().defaultTo("unknown");
    t.text("balance_check_message").nullable();

    t.text("notes").nullable();

    t.timestamps(true, true);
  });

  // Fast lookup when querying balance status across all providers
  await knex.schema.alterTable("provider_wallet_info", (t) => {
    t.index("balance_check_status", "idx_pwi_check_status");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_wallet_info");
}
