import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("failed_jobs", (table) => {
    table.uuid("id").primary();
    table.string("queue_name", 100).notNullable();
    table.string("job_name", 100).notNullable();
    table.string("reference", 128).nullable();
    table.jsonb("payload").notNullable().defaultTo("{}");
    table.text("error_message").notNullable();
    table.text("stack_trace").nullable();
    table.timestamp("failed_at").notNullable().defaultTo(knex.fn.now());
    table.integer("retry_count").notNullable().defaultTo(0);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["queue_name"]);
    table.index(["reference"]);
    table.index(["failed_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("failed_jobs");
}
