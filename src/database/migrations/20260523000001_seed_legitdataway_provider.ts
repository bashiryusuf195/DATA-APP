import { randomUUID } from "crypto";
import type { Knex } from "knex";

// Seeds a provider_configs row for LegitDataWay.
//
// LegitDataWay (legitdataway.com) supports: airtime, data, electricity,
// cable_tv, and exam_pin (WAEC / JAMB).
//
// Auth uses a generated access token obtained by posting username + password
// to POST /api/user.  Credentials are stored in provider_credentials:
//   username_encrypted       → LegitDataWay account username
//   password_encrypted       → LegitDataWay account password
//   bearer_token_encrypted   → auto-populated access token (cached, refreshed on 401)
//   base_url                 → defaults to https://legitdataway.com
//
// The row is inserted with is_active = false so routing rules and credentials
// must be configured explicitly in Admin before any traffic is sent to it.

export async function up(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .insert({
      id:                 randomUUID(),
      provider_code:      "legitdataway",
      name:               "LegitDataWay",
      is_active:          false,
      priority:           5,
      supported_services: JSON.stringify([
        "airtime",
        "data",
        "electricity",
        "cable_tv",
        "exam_pin",
      ]),
      health_status: "unknown",
      notes:
        "LegitDataWay (legitdataway.com) — airtime, data, electricity, cable_tv, exam_pin (WAEC/JAMB). " +
        "Token auth: add Username and Password in Admin > API Integrations > LegitDataWay. " +
        "Access token is generated and cached automatically on first use.",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflict("provider_code")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("provider_configs").where({ provider_code: "legitdataway" }).delete();
  await knex("provider_credentials").where({ provider_code: "legitdataway" }).delete();
}
