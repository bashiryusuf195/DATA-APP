import type { Knex } from "knex";

// Idempotent: creates the disputes table if it doesn't exist, then safely
// adds any columns/indexes that may be missing from a pre-existing table.
export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("disputes");

  if (!tableExists) {
    await knex.schema.createTable("disputes", (table) => {
      table.uuid("id").primary();
      table.string("reference", 100).notNullable().unique();
      table
        .uuid("ticket_id")
        .nullable()
        .references("id")
        .inTable("support_tickets")
        .onDelete("SET NULL");
      table.uuid("user_id").nullable();
      table.string("user_email", 200).nullable();
      table.string("transaction_reference", 200).nullable();
      table.string("dispute_type", 50).notNullable();
      table.decimal("amount_disputed", 18, 2).nullable();
      table.string("currency", 10).notNullable().defaultTo("NGN");
      table.string("status", 30).notNullable().defaultTo("open");
      table.string("resolution", 50).nullable();
      table.text("resolution_notes").nullable();
      table.timestamp("resolved_at", { useTz: true }).nullable();
      table.timestamps(true, true);
    });
  } else {
    // Table already exists — add any columns that may be missing.
    await knex.schema.alterTable("disputes", (table) => {
      // Each column is guarded individually via hasColumn below.
      void table; // alterTable callback required; actual work done per-column.
    });

    const cols: Array<[string, (t: Knex.AlterTableBuilder) => void]> = [
      ["reference",             (t) => t.string("reference", 100).notNullable().defaultTo("")],
      ["ticket_id",             (t) => t.uuid("ticket_id").nullable()],
      ["user_id",               (t) => t.uuid("user_id").nullable()],
      ["user_email",            (t) => t.string("user_email", 200).nullable()],
      ["transaction_reference", (t) => t.string("transaction_reference", 200).nullable()],
      ["dispute_type",          (t) => t.string("dispute_type", 50).notNullable().defaultTo("other")],
      ["amount_disputed",       (t) => t.decimal("amount_disputed", 18, 2).nullable()],
      ["currency",              (t) => t.string("currency", 10).notNullable().defaultTo("NGN")],
      ["status",                (t) => t.string("status", 30).notNullable().defaultTo("open")],
      ["resolution",            (t) => t.string("resolution", 50).nullable()],
      ["resolution_notes",      (t) => t.text("resolution_notes").nullable()],
      ["resolved_at",           (t) => t.timestamp("resolved_at", { useTz: true }).nullable()],
      ["created_at",            (t) => t.timestamps(true, true)],
    ];

    for (const [col, addCol] of cols) {
      // Skip the timestamps pseudo-check — handled via created_at presence.
      if (col === "created_at") {
        const has = await knex.schema.hasColumn("disputes", "created_at");
        if (!has) {
          await knex.schema.alterTable("disputes", addCol);
        }
        continue;
      }
      const has = await knex.schema.hasColumn("disputes", col);
      if (!has) {
        await knex.schema.alterTable("disputes", addCol);
      }
    }
  }

  // Add indexes with IF NOT EXISTS so they're safe to run on both new and
  // pre-existing tables without throwing "index already exists".
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS disputes_status_idx               ON disputes (status);
    CREATE INDEX IF NOT EXISTS disputes_dispute_type_idx         ON disputes (dispute_type);
    CREATE INDEX IF NOT EXISTS disputes_user_id_idx              ON disputes (user_id);
    CREATE INDEX IF NOT EXISTS disputes_transaction_reference_idx ON disputes (transaction_reference);
    CREATE INDEX IF NOT EXISTS disputes_created_at_idx           ON disputes (created_at);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("disputes");
}
