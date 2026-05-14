import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("transactions", (table) => {
    table.uuid("id").primary();

    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.string("reference", 64).notNullable().unique();

    table.string("type", 50).notNullable();
    table.string("status", 30).notNullable().defaultTo("pending");

    table.decimal("amount", 18, 2).notNullable();

    table.string("currency", 3).notNullable().defaultTo("NGN");

    table
      .uuid("source_wallet_id")
      .nullable()
      .references("id")
      .inTable("wallets");

    table
      .uuid("destination_wallet_id")
      .nullable()
      .references("id")
      .inTable("wallets");

    table.uuid("journal_batch_id").nullable();

    table.string("provider", 100).nullable();
    table.string("provider_reference", 255).nullable();

    table.text("description").nullable();

    table.jsonb("metadata").notNullable().defaultTo("{}");

    table.timestamp("processed_at").nullable();
    table.timestamp("failed_at").nullable();

    table.text("failure_reason").nullable();

    table.timestamps(true, true);

    table.index(["user_id"]);
    table.index(["reference"]);
    table.index(["status"]);
    table.index(["type"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("transactions");
}