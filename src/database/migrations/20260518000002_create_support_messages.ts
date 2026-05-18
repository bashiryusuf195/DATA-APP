import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("support_messages", (table) => {
    table.uuid("id").primary();
    table
      .uuid("ticket_id")
      .notNullable()
      .references("id")
      .inTable("support_tickets")
      .onDelete("CASCADE");
    // admin | customer | system
    table.string("sender_type", 20).notNullable();
    table.uuid("sender_id").nullable();
    table.string("sender_email", 200).nullable();
    table.text("body").notNullable();
    // true = internal admin note, hidden from customer
    table.boolean("is_internal").notNullable().defaultTo(false);
    table.jsonb("attachments").notNullable().defaultTo("[]");
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["ticket_id"]);
    table.index(["ticket_id", "is_internal"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("support_messages");
}
