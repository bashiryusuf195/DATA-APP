import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex("admin_settings")
    .insert([
      {
        key:         "support_widget_enabled",
        value:       "true",
        value_type:  "boolean",
        label:       "Support Widget",
        description: "Show the floating support widget on the customer dashboard",
        category:    "support",
        is_secret:   false,
      },
      {
        key:         "support_whatsapp_url",
        value:       "",
        value_type:  "text",
        label:       "WhatsApp Support URL",
        description: "WhatsApp chat link, e.g. https://wa.me/2348012345678?text=Hello",
        category:    "support",
        is_secret:   false,
      },
      {
        key:         "support_ticket_url",
        value:       "",
        value_type:  "text",
        label:       "Support Ticket URL",
        description: "URL or internal path for the support ticket page, e.g. /support or https://help.hivedata.ng",
        category:    "support",
        is_secret:   false,
      },
    ])
    .onConflict("key")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("admin_settings")
    .whereIn("key", ["support_widget_enabled", "support_whatsapp_url", "support_ticket_url"])
    .delete();
}
