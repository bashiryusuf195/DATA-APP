import { randomUUID } from "crypto";
import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.warn("[seed] 02_provider_configs skipped in production");
    return;
  }

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
