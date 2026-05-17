import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("provider_circuit_state");

  if (!tableExists) {
    await knex.schema.createTable("provider_circuit_state", (table) => {
      table.increments("id").primary();
      table.text("provider_code").notNullable();
      table.integer("failure_count").notNullable().defaultTo(0);
      table.integer("success_count").notNullable().defaultTo(0);
      table.integer("consecutive_failures").notNullable().defaultTo(0);
      table.timestamp("last_failure_at", { useTz: true }).nullable();
      table.timestamp("last_success_at", { useTz: true }).nullable();
      table.boolean("circuit_open").notNullable().defaultTo(false);
      table.timestamp("circuit_opened_at", { useTz: true }).nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  } else {
    // Table already exists — check for any missing columns before alterTable
    const [
      hasProviderCode,
      hasFailureCount,
      hasSuccessCount,
      hasConsecutiveFailures,
      hasLastFailureAt,
      hasLastSuccessAt,
      hasCircuitOpen,
      hasCircuitOpenedAt,
      hasCreatedAt,
      hasUpdatedAt,
    ] = await Promise.all([
      knex.schema.hasColumn("provider_circuit_state", "provider_code"),
      knex.schema.hasColumn("provider_circuit_state", "failure_count"),
      knex.schema.hasColumn("provider_circuit_state", "success_count"),
      knex.schema.hasColumn("provider_circuit_state", "consecutive_failures"),
      knex.schema.hasColumn("provider_circuit_state", "last_failure_at"),
      knex.schema.hasColumn("provider_circuit_state", "last_success_at"),
      knex.schema.hasColumn("provider_circuit_state", "circuit_open"),
      knex.schema.hasColumn("provider_circuit_state", "circuit_opened_at"),
      knex.schema.hasColumn("provider_circuit_state", "created_at"),
      knex.schema.hasColumn("provider_circuit_state", "updated_at"),
    ]);

    const needsAnyColumn =
      !hasProviderCode || !hasFailureCount || !hasSuccessCount ||
      !hasConsecutiveFailures || !hasLastFailureAt || !hasLastSuccessAt ||
      !hasCircuitOpen || !hasCircuitOpenedAt || !hasCreatedAt || !hasUpdatedAt;

    if (needsAnyColumn) {
      await knex.schema.alterTable("provider_circuit_state", (table) => {
        if (!hasProviderCode)        table.text("provider_code").notNullable().defaultTo("");
        if (!hasFailureCount)        table.integer("failure_count").notNullable().defaultTo(0);
        if (!hasSuccessCount)        table.integer("success_count").notNullable().defaultTo(0);
        if (!hasConsecutiveFailures) table.integer("consecutive_failures").notNullable().defaultTo(0);
        if (!hasLastFailureAt)       table.timestamp("last_failure_at", { useTz: true }).nullable();
        if (!hasLastSuccessAt)       table.timestamp("last_success_at", { useTz: true }).nullable();
        if (!hasCircuitOpen)         table.boolean("circuit_open").notNullable().defaultTo(false);
        if (!hasCircuitOpenedAt)     table.timestamp("circuit_opened_at", { useTz: true }).nullable();
        if (!hasCreatedAt)           table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        if (!hasUpdatedAt)           table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      });
    }
  }

  // Check columns exist before creating indexes
  const [hasProviderCode, hasCircuitOpen] = await Promise.all([
    knex.schema.hasColumn("provider_circuit_state", "provider_code"),
    knex.schema.hasColumn("provider_circuit_state", "circuit_open"),
  ]);

  if (hasProviderCode) {
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_pcs_provider_code ON provider_circuit_state (provider_code)"
    );
    await knex.raw(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_pcs_provider_code_unique ON provider_circuit_state (provider_code)"
    );
  }

  if (hasCircuitOpen) {
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_pcs_circuit_open ON provider_circuit_state (circuit_open)"
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_circuit_state");
}
