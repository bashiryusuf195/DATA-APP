import type { Knex } from "knex";

// Adds 'data' to SMShika's supported_services so the execution engine can
// route data purchases to SMShika.  The engine uses a JSON containment check
// (supported_services @> '["data"]'::jsonb), so 'data' must be in the array
// for SMShika to appear as a candidate for data transactions.
export async function up(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .where({ provider_code: "smshika" })
    .update({
      supported_services: JSON.stringify(["airtime", "data"]),
      notes: "SMShika airtime + data provider. Add base_url and api_key in API Integrations before enabling.",
      updated_at: new Date(),
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .where({ provider_code: "smshika" })
    .update({
      supported_services: JSON.stringify(["airtime"]),
      notes: "SMShika airtime provider. Add base_url and api_key in API Integrations before enabling.",
      updated_at: new Date(),
    });
}
