import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("support_tickets", (table) => {
    table.uuid("id").primary();
    table.string("reference", 100).notNullable().unique();
    table.uuid("user_id").nullable();
    table.string("user_email", 200).nullable();
    table.string("transaction_reference", 200).nullable();
    table.string("subject", 500).notNullable();
    table.text("description").nullable();
    // open | pending | resolved | closed
    table.string("status", 20).notNullable().defaultTo("open");
    // low | medium | high | urgent
    table.string("priority", 20).notNullable().defaultTo("medium");
    // complaint | dispute | inquiry | technical | billing
    table.string("category", 100).nullable();
    table.uuid("assigned_to").nullable();
    table.string("assigned_to_email", 200).nullable();
    table.text("resolution_notes").nullable();
    table.timestamp("resolved_at", { useTz: true }).nullable();
    table.timestamp("closed_at", { useTz: true }).nullable();
    table.timestamps(true, true);

    table.index(["status"]);
    table.index(["priority"]);
    table.index(["category"]);
    table.index(["user_id"]);
    table.index(["assigned_to"]);
    table.index(["transaction_reference"]);
    table.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("support_tickets");
}
