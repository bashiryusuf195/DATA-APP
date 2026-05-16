import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("webhook_events");

  if (!tableExists) {
    // Happy path — table is absent, create it in one shot.
    await knex.schema.createTable("webhook_events", (table) => {
      table.uuid("id").primary();
      table.string("provider_code", 100).notNullable();
      table.string("event_type", 100).nullable();
      table.string("provider_reference", 255).nullable();
      table.string("transaction_reference", 128).nullable();
      table.jsonb("payload").notNullable().defaultTo("{}");
      table.jsonb("headers").notNullable().defaultTo("{}");
      table.boolean("signature_valid").notNullable().defaultTo(false);
      table.boolean("processed").notNullable().defaultTo(false);
      table.timestamp("processed_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    });
  } else {
    // Table already exists (possibly from a partial run).
    // Check every non-PK column and add whichever are missing.
    // hasColumn calls are batched for speed but results are used
    // synchronously inside the alterTable callback.
    const [
      hasProviderCode,
      hasEventType,
      hasProviderReference,
      hasTransactionReference,
      hasPayload,
      hasHeaders,
      hasSignatureValid,
      hasProcessed,
      hasProcessedAt,
      hasCreatedAt,
    ] = await Promise.all([
      knex.schema.hasColumn("webhook_events", "provider_code"),
      knex.schema.hasColumn("webhook_events", "event_type"),
      knex.schema.hasColumn("webhook_events", "provider_reference"),
      knex.schema.hasColumn("webhook_events", "transaction_reference"),
      knex.schema.hasColumn("webhook_events", "payload"),
      knex.schema.hasColumn("webhook_events", "headers"),
      knex.schema.hasColumn("webhook_events", "signature_valid"),
      knex.schema.hasColumn("webhook_events", "processed"),
      knex.schema.hasColumn("webhook_events", "processed_at"),
      knex.schema.hasColumn("webhook_events", "created_at"),
    ]);

    const anyMissing =
      !hasProviderCode ||
      !hasEventType ||
      !hasProviderReference ||
      !hasTransactionReference ||
      !hasPayload ||
      !hasHeaders ||
      !hasSignatureValid ||
      !hasProcessed ||
      !hasProcessedAt ||
      !hasCreatedAt;

    if (anyMissing) {
      await knex.schema.alterTable("webhook_events", (table) => {
        // NOT NULL columns get a safe default so existing rows are valid.
        if (!hasProviderCode) {
          table.string("provider_code", 100).notNullable().defaultTo("unknown");
        }
        if (!hasEventType) table.string("event_type", 100).nullable();
        if (!hasProviderReference) table.string("provider_reference", 255).nullable();
        if (!hasTransactionReference) table.string("transaction_reference", 128).nullable();
        if (!hasPayload) table.jsonb("payload").notNullable().defaultTo("{}");
        if (!hasHeaders) table.jsonb("headers").notNullable().defaultTo("{}");
        if (!hasSignatureValid) {
          table.boolean("signature_valid").notNullable().defaultTo(false);
        }
        if (!hasProcessed) table.boolean("processed").notNullable().defaultTo(false);
        if (!hasProcessedAt) table.timestamp("processed_at").nullable();
        if (!hasCreatedAt) {
          table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
        }
      });
    }
  }

  // Create indexes only after all columns are guaranteed to exist.
  // IF NOT EXISTS makes each statement a no-op when already present.
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
  // dropTableIfExists is already idempotent.
  await knex.schema.dropTableIfExists("webhook_events");
}
