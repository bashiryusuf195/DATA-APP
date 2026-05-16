import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Insert the VTPass provider_configs row if it does not already exist.
  // Seeded inactive (is_active = false) so it is never selected by the routing
  // service until an admin explicitly enables it after verifying credentials.
  await knex.raw(`
    INSERT INTO provider_configs
      (id, provider_code, name, is_active, priority, supported_services, health_status, metadata, created_at, updated_at)
    VALUES
      (uuid_generate_v4(), 'vtpass', 'VTPass Sandbox', false, 2, '["airtime"]'::jsonb, 'unknown', '{}'::jsonb, now(), now())
    ON CONFLICT (provider_code) DO NOTHING
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex("provider_configs").where({ provider_code: "vtpass" }).delete();
}
