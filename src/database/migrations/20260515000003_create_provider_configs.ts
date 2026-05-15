import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("provider_configs", (table) => {
    table.uuid("id").primary();
    table.string("provider_code", 100).notNullable().unique();
    table.string("name", 200).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.integer("priority").notNullable().defaultTo(100);
    // Array of ProviderServiceType strings e.g. ["airtime","data",...]
    table.jsonb("supported_services").notNullable().defaultTo("[]");
    table.string("health_status", 50).notNullable().defaultTo("healthy");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);

    table.index(["is_active", "priority"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_configs");
}
