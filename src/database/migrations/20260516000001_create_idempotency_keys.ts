import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("idempotency_keys", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable();
    table.string("idempotency_key", 255).notNullable();
    table.string("endpoint", 255).notNullable();
    table.string("request_hash", 64).notNullable(); // SHA-256 hex
    table.jsonb("response_body").nullable();
    table.integer("status_code").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();

    // Uniqueness is scoped per user — two different users may use the same key value.
    table.unique(["user_id", "idempotency_key"]);

    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("idempotency_keys");
}
