import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("notification_preferences");
  if (exists) return;

  await knex.schema.createTable("notification_preferences", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table
      .uuid("user_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // Channel toggles
    table.boolean("email_enabled").notNullable().defaultTo(true);
    table.boolean("sms_enabled").notNullable().defaultTo(false);
    table.boolean("push_enabled").notNullable().defaultTo(false);

    // Category toggles
    table.boolean("transaction_alerts").notNullable().defaultTo(true);
    table.boolean("security_alerts").notNullable().defaultTo(true);
    table.boolean("marketing_messages").notNullable().defaultTo(false);

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_notif_prefs_user_id ON notification_preferences (user_id)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notification_preferences");
}
