import type { Knex } from "knex";

// Adds audit_action enum values for CMS operations.
// ALTER TYPE ... ADD VALUE must run outside a transaction.
export const config = { transaction: false };

const CMS_AUDIT_VALUES = [
  "content_create",
  "content_update",
  "content_publish",
  "content_unpublish",
  "content_delete",
] as const;

export async function up(knex: Knex): Promise<void> {
  // ── 1. Extend audit_action enum ─────────────────────────────────────────────
  for (const value of CMS_AUDIT_VALUES) {
    await knex.raw(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${value}'`);
  }

  // ── 2. site_pages table ─────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS site_pages (
      slug         TEXT        PRIMARY KEY,
      title        TEXT        NOT NULL,
      content      TEXT        NOT NULL DEFAULT '',
      is_published BOOLEAN     NOT NULL DEFAULT FALSE,
      version      INTEGER     NOT NULL DEFAULT 1,
      created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
      updated_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_site_pages_is_published
      ON site_pages (is_published)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS site_pages`);
  // Postgres does not support removing enum values — leave them in place.
}
