import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Migrate backup codes from TEXT[] to JSONB.
  // node-postgres automatically parses JSONB as JS arrays;
  // TEXT[] parsing is driver-config-dependent and unreliable in Knex.
  await knex.raw(`
    ALTER TABLE users
      ALTER COLUMN totp_backup_codes TYPE JSONB
      USING CASE
        WHEN totp_backup_codes IS NULL THEN NULL
        ELSE to_jsonb(totp_backup_codes)
      END
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
      ALTER COLUMN totp_backup_codes TYPE TEXT[]
      USING CASE
        WHEN totp_backup_codes IS NULL THEN NULL
        ELSE ARRAY(SELECT jsonb_array_elements_text(totp_backup_codes))
      END
  `);
}
