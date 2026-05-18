import type { Knex } from "knex";

// Repairs the legacy `disputes` table (created by 20240101000004) so the
// support disputes service can insert rows without supplying the legacy
// NOT-NULL columns (transaction_id, user_id, subject, description) or
// satisfying the amount_disputed > 0 CHECK constraint.
// Also converts the `status` column from the PostgreSQL ENUM `dispute_status`
// to VARCHAR(30) so plain string inserts work.
// All steps are idempotent — safe to run on both legacy and fresh tables.
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("disputes");
  if (!exists) return;

  // ── 1. Drop NOT NULL from legacy required columns ─────────────────────────
  for (const col of ["transaction_id", "user_id", "subject", "description"] as const) {
    const has = await knex.schema.hasColumn("disputes", col);
    if (has) {
      await knex.raw(`ALTER TABLE disputes ALTER COLUMN "${col}" DROP NOT NULL`);
    }
  }

  // ── 2. amount_disputed: drop NOT NULL + drop all CHECK constraints ─────────
  // We drop all CHECKs because the legacy table has two (amount > 0, currency
  // format) and PostgreSQL requires knowing the auto-generated constraint name.
  // The currency format check is not needed — the application enforces it.
  const hasAmount = await knex.schema.hasColumn("disputes", "amount_disputed");
  if (hasAmount) {
    await knex.raw(`ALTER TABLE disputes ALTER COLUMN "amount_disputed" DROP NOT NULL`);
    await knex.raw(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          WHERE rel.relname = 'disputes' AND con.contype = 'c'
        LOOP
          EXECUTE 'ALTER TABLE disputes DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
        END LOOP;
      END $$;
    `);
  }

  // ── 3. status: convert from ENUM to VARCHAR(30) if still ENUM ─────────────
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'disputes'
          AND column_name = 'status'
          AND data_type = 'USER-DEFINED'
      ) THEN
        ALTER TABLE disputes
          ALTER COLUMN status TYPE VARCHAR(30) USING status::TEXT;
        ALTER TABLE disputes
          ALTER COLUMN status SET DEFAULT 'open';
      END IF;
    END $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Intentionally blank — reversing constraint changes is unsafe with live data.
}
