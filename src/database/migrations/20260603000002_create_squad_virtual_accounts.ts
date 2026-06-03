import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("squad_virtual_accounts", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").notNullable().unique()
      .references("id").inTable("users").onDelete("CASCADE");
    // customer_identifier sent to Squad — we use user_id (UUID) as the identifier
    t.text("customer_identifier").notNullable().unique();
    t.text("virtual_account_number").notNullable();
    t.text("account_name").notNullable();
    t.text("bank_name").notNullable();
    t.text("bank_code").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE TRIGGER set_squad_virtual_accounts_updated_at
    BEFORE UPDATE ON squad_virtual_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.table("squad_virtual_accounts", (t) => {
    t.index("customer_identifier", "idx_squad_va_customer_identifier");
    t.index("virtual_account_number", "idx_squad_va_account_number");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("squad_virtual_accounts");
}
