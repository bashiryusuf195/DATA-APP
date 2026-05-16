import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("funding_transactions");
  if (!exists) {
    await knex.schema.createTable("funding_transactions", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
      table.string("reference", 100).notNullable().unique();
      table.string("provider_reference", 255).nullable();
      table.string("payment_gateway", 50).notNullable().defaultTo("paystack");
      // amount stored in major currency unit (NGN), not kobo
      table.decimal("amount", 18, 2).notNullable();
      table.string("currency", 3).notNullable().defaultTo("NGN");
      table
        .enum("status", ["pending", "successful", "failed", "abandoned"])
        .notNullable()
        .defaultTo("pending");
      table.string("payment_channel", 50).nullable();
      table.boolean("verified").notNullable().defaultTo(false);
      table.jsonb("metadata").notNullable().defaultTo("{}");
      table.timestamp("paid_at", { useTz: true }).nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_ft_user_id ON funding_transactions (user_id)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_ft_reference ON funding_transactions (reference)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_ft_status ON funding_transactions (status)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_ft_gateway ON funding_transactions (payment_gateway)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_ft_verified ON funding_transactions (verified)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_ft_created_at ON funding_transactions (created_at DESC)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("funding_transactions");
}
