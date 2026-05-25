import type { Knex } from "knex";

// Adds 'cable_tv' to SMShika's supported_services so the execution engine
// can route cable TV subscriptions to SMShika.
export async function up(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .where({ provider_code: "smshika" })
    .update({
      supported_services: JSON.stringify(["airtime", "data", "electricity", "cable_tv"]),
      notes: "SMShika airtime + data + electricity + cable_tv. Add base_url and api_key in API Integrations before enabling.",
      updated_at: new Date(),
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .where({ provider_code: "smshika" })
    .update({
      supported_services: JSON.stringify(["airtime", "data", "electricity"]),
      notes: "SMShika airtime + data + electricity provider.",
      updated_at: new Date(),
    });
}
