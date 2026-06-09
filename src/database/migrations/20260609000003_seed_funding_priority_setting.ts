import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex("admin_settings")
    .insert({
      key:         "dashboard_funding_priority",
      value:       "quick_first",
      value_type:  "text",
      label:       "Dashboard Funding Card Order",
      description: "Which funding method card appears first on the customer dashboard. Use: dedicated_first | quick_first",
      category:    "payment",
      is_secret:   false,
    })
    .onConflict("key")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("admin_settings").where({ key: "dashboard_funding_priority" }).delete();
}
