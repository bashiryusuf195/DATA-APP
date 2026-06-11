import type { Knex } from "knex";

// Updates the VTPass provider_configs row (seeded inactive by migration
// 20260516000010) to reflect the full set of services now implemented in
// vtpass.provider.ts. The row stays is_active=false until an admin
// explicitly enables it after verifying sandbox credentials.

export async function up(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .where({ provider_code: "vtpass" })
    .update({
      supported_services: JSON.stringify([
        "airtime",
        "data",
        "cable_tv",
        "electricity",
        "exam_pin",
      ]),
      updated_at: knex.fn.now(),
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .where({ provider_code: "vtpass" })
    .update({
      supported_services: JSON.stringify(["airtime"]),
      updated_at: knex.fn.now(),
    });
}
