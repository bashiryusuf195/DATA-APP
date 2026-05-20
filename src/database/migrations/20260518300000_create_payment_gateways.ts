import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("payment_gateways", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("code", 50).notNullable().unique(); // 'paystack' | 'monnify' | 'billstack' | custom
    t.string("name", 200).notNullable();
    t.boolean("is_active").notNullable().defaultTo(false);
    t.boolean("is_default").notNullable().defaultTo(false);
    t.boolean("is_live").notNullable().defaultTo(false);  // false = test mode
    t.boolean("is_supported").notNullable().defaultTo(false); // actual API integration exists
    t.string("base_url", 500).nullable();
    t.string("public_key", 500).nullable();
    t.text("secret_key_encrypted").nullable();      // never returned to frontend
    t.text("webhook_secret_encrypted").nullable();  // never returned to frontend
    // Top-up charge configuration
    t.string("charge_type", 20).notNullable().defaultTo("none"); // 'flat' | 'percentage' | 'none'
    t.decimal("charge_value", 20, 4).notNullable().defaultTo(0);
    t.text("notes").nullable();
    t.timestamps(true, true);
  });

  // Ensure only one default at a time — enforced in application layer, but index helps reads
  await knex.schema.alterTable("payment_gateways", (t) => {
    t.index("is_default", "idx_pg_default");
    t.index("is_active", "idx_pg_active");
  });

  // Seed known gateways
  await knex("payment_gateways").insert([
    {
      id: knex.raw("gen_random_uuid()"),
      code: "paystack",
      name: "Paystack",
      is_active: true,
      is_default: true,
      is_live: false,
      is_supported: true,
      base_url: "https://api.paystack.co",
      charge_type: "none",
      charge_value: 0,
    },
    {
      id: knex.raw("gen_random_uuid()"),
      code: "monnify",
      name: "Monnify",
      is_active: false,
      is_default: false,
      is_live: false,
      is_supported: false,
      base_url: "https://api.monnify.com",
      charge_type: "none",
      charge_value: 0,
    },
    {
      id: knex.raw("gen_random_uuid()"),
      code: "billstack",
      name: "BillStack",
      is_active: false,
      is_default: false,
      is_live: false,
      is_supported: false,
      base_url: null,
      charge_type: "none",
      charge_value: 0,
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("payment_gateways");
}
