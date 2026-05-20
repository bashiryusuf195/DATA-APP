import { randomUUID } from "crypto";
import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  // Seed a disabled SMShika provider_config row so it appears in the admin
  // API Integrations list.  Credentials (base_url, api_key) must be added
  // through the admin dashboard before enabling.
  await knex("provider_configs")
    .insert({
      id:                 randomUUID(),
      provider_code:      "smshika",
      name:               "SMShika",
      is_active:          false,
      priority:           3,
      supported_services: JSON.stringify(["airtime"]),
      health_status:      "unknown",
      notes:              "SMShika airtime provider. Add base_url and api_key in API Integrations before enabling.",
      metadata:           JSON.stringify({}),
    })
    .onConflict("provider_code")
    .ignore();
}
