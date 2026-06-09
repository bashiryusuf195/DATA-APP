import type { Knex } from "knex";

const SEED_SERVICES = [
  { service_key: "mtn",         service_name: "MTN",                  category: "airtime_data" },
  { service_key: "airtel",      service_name: "Airtel",               category: "airtime_data" },
  { service_key: "glo",         service_name: "GLO",                  category: "airtime_data" },
  { service_key: "9mobile",     service_name: "9mobile",              category: "airtime_data" },
  { service_key: "electricity", service_name: "Electricity",          category: "electricity"  },
  { service_key: "cable_tv",    service_name: "Cable TV",             category: "cable_tv"     },
  { service_key: "exam_pin",    service_name: "Exam PIN",             category: "exam_pin"     },
  { service_key: "identity",    service_name: "Identity Verification",category: "identity"     },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("service_statuses", (t) => {
    t.string("service_key", 50).primary();
    t.string("service_name", 100).notNullable();
    t.string("category", 50).notNullable();
    t.string("status", 20).notNullable().defaultTo("available");
    t.text("message").nullable();
    t.timestamp("maintenance_start", { useTz: true }).nullable();
    t.timestamp("maintenance_end",   { useTz: true }).nullable();
    t.uuid("updated_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamps(true, true);
  });

  await knex("service_statuses").insert(
    SEED_SERVICES.map((s) => ({ ...s, status: "available" }))
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_statuses");
}
