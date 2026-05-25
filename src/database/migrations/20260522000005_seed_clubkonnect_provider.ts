import { randomUUID } from "crypto";
import type { Knex } from "knex";

// Seeds a provider_configs row for Clubkonnect.
//
// Clubkonnect (nellobytesystems.com) supports: airtime, data, electricity,
// cable_tv, and exam_pin (WAEC / JAMB).
//
// The row is inserted with is_active = false so routing rules and credentials
// must be configured explicitly in Admin before any traffic is sent to it.
//
// Credentials are stored separately in provider_credentials (never here):
//   - username_encrypted → Clubkonnect UserID
//   - api_key_encrypted  → Clubkonnect APIKey
//   - base_url           → defaults to https://www.nellobytesystems.com

export async function up(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .insert({
      id:                 randomUUID(),
      provider_code:      "clubkonnect",
      name:               "Clubkonnect",
      is_active:          false,
      priority:           4,
      supported_services: JSON.stringify([
        "airtime",
        "data",
        "electricity",
        "cable_tv",
        "exam_pin",
      ]),
      health_status: "unknown",
      notes:
        "Clubkonnect (nellobytesystems.com) — airtime, data, electricity, cable_tv, exam_pin (WAEC/JAMB). " +
        "Add UserID (username field) and APIKey in Admin > API Integrations before enabling.",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflict("provider_code")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("provider_configs").where({ provider_code: "clubkonnect" }).delete();
}
