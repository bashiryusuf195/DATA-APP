import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("provider_credentials", (t) => {
    t.text("bearer_token_encrypted").nullable();
    t.text("webhook_secret_encrypted").nullable();
  });

  await knex.schema.alterTable("provider_configs", (t) => {
    t.text("notes").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("provider_credentials", (t) => {
    t.dropColumn("bearer_token_encrypted");
    t.dropColumn("webhook_secret_encrypted");
  });

  await knex.schema.alterTable("provider_configs", (t) => {
    t.dropColumn("notes");
  });
}
