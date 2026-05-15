import { randomUUID } from "crypto";
import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  await knex("provider_configs")
    .insert({
      id: randomUUID(),
      provider_code: "mock_vtu_provider",
      name: "Mock VTU Provider",
      is_active: true,
      priority: 1,
      supported_services: JSON.stringify([
        "airtime",
        "data",
        "electricity",
        "cable_tv",
        "exam_pin",
        "identity_verification",
      ]),
      health_status: "healthy",
      metadata: JSON.stringify({}),
    })
    .onConflict("provider_code")
    .ignore();
}
