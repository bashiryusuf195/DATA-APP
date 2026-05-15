import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("catalog_services", (table) => {
    table.uuid("id").primary();
    table.string("slug", 100).notNullable().unique();
    table.string("name", 200).notNullable();
    table.string("service_type", 50).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index(["service_type"]);
    table.index(["is_active"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("catalog_services");
}
