import { randomUUID } from "crypto";
import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  // NOTE: The authoritative vtpass row is created by migration 20260516000010.
  // This seed is a no-op if the migration has already run (ON CONFLICT DO NOTHING).
  // mock_vtu_provider priority is intentionally left at 1 (highest priority fallback).
  await knex("provider_configs")
    .insert({
      id:                 randomUUID(),
      provider_code:      "vtpass",
      name:               "VTPass Sandbox",
      is_active:          false,
      priority:           2,
      supported_services: JSON.stringify(["airtime"]),
      health_status:      "unknown",
      metadata:           JSON.stringify({}),
    })
    .onConflict("provider_code")
    .ignore();
}
