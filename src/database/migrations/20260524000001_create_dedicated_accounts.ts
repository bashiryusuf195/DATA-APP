import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("dedicated_accounts", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("user_id").notNullable().unique().references("id").inTable("users").onDelete("CASCADE");
    t.text("paystack_customer_code").notNullable();
    t.text("account_number").notNullable();
    t.text("account_name").notNullable();
    t.text("bank_name").notNullable();
    t.text("bank_slug").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER set_dedicated_accounts_updated_at
    BEFORE UPDATE ON dedicated_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.table("dedicated_accounts", (t) => {
    t.index("paystack_customer_code", "idx_dedicated_accounts_customer_code");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dedicated_accounts");
}
