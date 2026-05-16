import type { Knex } from "knex";

// ── Repair migration ──────────────────────────────────────────────────────────
//
// The webhook_events table was created by a legacy migration with a schema
// that does not match the current webhook service.  Specifically:
//
//   • endpoint_url  NOT NULL  — our service never writes this column,
//                               so every INSERT raised a not-null violation.
//   • Several columns our service requires were missing.
//
// All statements use raw SQL with IF EXISTS / IF NOT EXISTS / DROP NOT NULL so
// the migration is fully idempotent and safe against a partitioned table
// (knex schema builder methods do not always propagate to child partitions).
// ─────────────────────────────────────────────────────────────────────────────

export async function up(knex: Knex): Promise<void> {
  // 1. Make endpoint_url nullable so our INSERT succeeds without providing it.
  //    PostgreSQL propagates ALTER COLUMN to all partitions automatically.
  const hasEndpointUrl = await knex.schema.hasColumn(
    "webhook_events",
    "endpoint_url"
  );
  if (hasEndpointUrl) {
    await knex.raw(
      "ALTER TABLE webhook_events ALTER COLUMN endpoint_url DROP NOT NULL"
    );
  }

  // 2. Add every column the webhook service writes, skipping those that
  //    already exist.  NOT NULL columns carry a DEFAULT so existing rows
  //    remain valid after the ALTER TABLE.
  await knex.raw(`
    ALTER TABLE webhook_events
      ADD COLUMN IF NOT EXISTS provider_code         varchar(100) NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS event_type            varchar(100),
      ADD COLUMN IF NOT EXISTS provider_reference    varchar(255),
      ADD COLUMN IF NOT EXISTS transaction_reference varchar(128),
      ADD COLUMN IF NOT EXISTS payload               jsonb        NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS headers               jsonb        NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS signature_valid       boolean      NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS processed             boolean      NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS processed_at          timestamp,
      ADD COLUMN IF NOT EXISTS created_at            timestamp    NOT NULL DEFAULT now()
  `);

  // 3. Ensure required indexes exist.
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS webhook_events_provider_code_index ON webhook_events (provider_code)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS webhook_events_transaction_reference_index ON webhook_events (transaction_reference)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS webhook_events_provider_reference_index ON webhook_events (provider_reference)"
  );
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS webhook_events_created_at_index ON webhook_events (created_at)"
  );
}

export async function down(knex: Knex): Promise<void> {
  // Restore endpoint_url NOT NULL (backfill nulls first to avoid violations).
  const hasEndpointUrl = await knex.schema.hasColumn(
    "webhook_events",
    "endpoint_url"
  );
  if (hasEndpointUrl) {
    await knex.raw(
      "UPDATE webhook_events SET endpoint_url = '' WHERE endpoint_url IS NULL"
    );
    await knex.raw(
      "ALTER TABLE webhook_events ALTER COLUMN endpoint_url SET NOT NULL"
    );
  }
  // Added columns are intentionally not dropped in rollback to preserve data.
}
