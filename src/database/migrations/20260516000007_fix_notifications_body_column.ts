import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Ensure body column exists on the parent (as nullable).
  //    ADD COLUMN IF NOT EXISTS is a no-op if it already exists.
  await knex.raw(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body text`);

  // 2. Drop NOT NULL from the parent table.
  //    Silently succeeds if body is already nullable.
  await knex.raw(`ALTER TABLE notifications ALTER COLUMN body DROP NOT NULL`);

  // 3. Drop NOT NULL from every existing partition explicitly.
  //    Older PostgreSQL versions do not propagate DROP NOT NULL from the parent
  //    to already-existing child tables (e.g. notifications_default).
  await knex.raw(`
    DO $$
    DECLARE rec RECORD;
    BEGIN
      FOR rec IN
        SELECT inhrelid::regclass::text AS tbl
        FROM pg_inherits
        WHERE inhparent = 'notifications'::regclass
      LOOP
        EXECUTE format('ALTER TABLE %s ALTER COLUMN body DROP NOT NULL', rec.tbl);
      END LOOP;
    END $$
  `);

  // 4. Backfill body from message for any rows that have message but no body.
  await knex.raw(`
    UPDATE notifications
       SET body = message
     WHERE body IS NULL
       AND message IS NOT NULL
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // body stays nullable — re-adding NOT NULL would break any null rows created
  // after this migration, so rollback is intentionally a no-op.
}
