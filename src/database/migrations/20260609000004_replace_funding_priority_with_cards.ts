import type { Knex } from "knex";

const DEFAULT_CARDS = JSON.stringify([
  { type: "quick_transfer",    enabled: true },
  { type: "dedicated_account", enabled: true },
])

export async function up(knex: Knex): Promise<void> {
  await knex("admin_settings").where({ key: "dashboard_funding_priority" }).delete()

  await knex("admin_settings")
    .insert({
      key:         "dashboard_funding_cards",
      value:       DEFAULT_CARDS,
      value_type:  "json",
      label:       "Dashboard Funding Cards",
      description: 'Ordered list of funding cards shown on the customer dashboard. Each entry: {"type":"quick_transfer"|"dedicated_account","enabled":true|false}. Array order = display order.',
      category:    "payment",
      is_secret:   false,
    })
    .onConflict("key")
    .ignore()
}

export async function down(knex: Knex): Promise<void> {
  await knex("admin_settings").where({ key: "dashboard_funding_cards" }).delete()

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
    .ignore()
}
