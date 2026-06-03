import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const existing = await knex("payment_gateways").where({ code: "squad" }).first();
  if (existing) return;

  await knex("payment_gateways").insert({
    id:           knex.raw("gen_random_uuid()"),
    code:         "squad",
    name:         "Squad",
    is_active:    false,
    is_default:   false,
    is_live:      false,
    is_supported: true,
    base_url:     "https://sandbox-api-d.squadco.com",
    charge_type:  "none",
    charge_value: 0,
    notes:        "Squad payment gateway. Set base_url to production URL from Squad dashboard for live mode.",
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("payment_gateways").where({ code: "squad" }).delete();
}
