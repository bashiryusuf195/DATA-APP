import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("provider_attempts");

  if (!exists) {
    await knex.schema.createTable("provider_attempts", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      table.text("transaction_reference").notNullable();
      table.text("provider_code").notNullable();
      table.integer("attempt_number").notNullable();
      table.jsonb("request_payload").notNullable().defaultTo("{}");
      table.jsonb("response_payload").notNullable().defaultTo("{}");
      table.boolean("success").notNullable();
      table.text("error_message").nullable();
      table.integer("latency_ms").nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_pa_transaction_reference ON provider_attempts (transaction_reference)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_pa_provider_code ON provider_attempts (provider_code)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_pa_success ON provider_attempts (success)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_pa_created_at ON provider_attempts (created_at DESC)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_attempts");
}
