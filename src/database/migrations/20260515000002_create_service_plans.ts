import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("service_plans", (table) => {
    table.uuid("id").primary();
    table
      .uuid("service_id")
      .notNullable()
      .references("id")
      .inTable("catalog_services")
      .onDelete("CASCADE");
    table.string("provider_code", 100).notNullable();
    table.string("name", 200).notNullable();
    table.string("variation_code", 100).notNullable();
    table.decimal("amount", 18, 2).notNullable();
    table.decimal("cost_price", 18, 2).nullable();
    table.decimal("selling_price", 18, 2).nullable();
    // true = amount is user-supplied at purchase time (e.g. electricity top-up)
    table.boolean("is_variable_amount").notNullable().defaultTo(false);
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.unique(["service_id", "variation_code"]);
    table.index(["service_id", "is_active"]);
    table.index(["variation_code"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_plans");
}
