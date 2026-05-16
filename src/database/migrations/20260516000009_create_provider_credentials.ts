import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("provider_credentials");
  if (exists) return;

  await knex.schema.createTable("provider_credentials", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.string("provider_code", 100).notNullable().unique();

    table.text("base_url").nullable();

    // Stored encrypted at rest. Column names carry the _encrypted suffix so
    // no one accidentally returns raw values in an API response.
    table.text("api_key_encrypted").nullable();
    table.text("secret_key_encrypted").nullable();
    table.text("username_encrypted").nullable();
    table.text("password_encrypted").nullable();

    table.boolean("is_live").notNullable().defaultTo(false);
    table.jsonb("metadata").notNullable().defaultTo("{}");

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_provider_creds_code ON provider_credentials (provider_code)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_credentials");
}
