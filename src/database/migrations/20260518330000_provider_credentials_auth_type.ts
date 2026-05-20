import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("provider_credentials", (t) => {
    t.text("auth_type").notNullable().defaultTo("api_key");
    t.text("custom_headers_encrypted").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("provider_credentials", (t) => {
    t.dropColumn("auth_type");
    t.dropColumn("custom_headers_encrypted");
  });
}
