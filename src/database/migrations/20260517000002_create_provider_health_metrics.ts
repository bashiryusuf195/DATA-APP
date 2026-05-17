import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("provider_health_metrics");

  if (!tableExists) {
    await knex.schema.createTable("provider_health_metrics", (table) => {
      table.increments("id").primary();
      table.text("provider_code").notNullable().unique();
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
    // Table already exists — safely add any missing columns
    await knex.schema.alterTable("provider_health_metrics", async (table) => {
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
        knex.schema.hasColumn("provider_health_metrics", "provider_code"),
        knex.schema.hasColumn("provider_health_metrics", "failure_count"),
        knex.schema.hasColumn("provider_health_metrics", "success_count"),
        knex.schema.hasColumn("provider_health_metrics", "consecutive_failures"),
        knex.schema.hasColumn("provider_health_metrics", "last_failure_at"),
        knex.schema.hasColumn("provider_health_metrics", "last_success_at"),
        knex.schema.hasColumn("provider_health_metrics", "circuit_open"),
        knex.schema.hasColumn("provider_health_metrics", "circuit_opened_at"),
        knex.schema.hasColumn("provider_health_metrics", "created_at"),
        knex.schema.hasColumn("provider_health_metrics", "updated_at"),
      ]);

      if (!hasProviderCode)         table.text("provider_code").notNullable().defaultTo("").unique();
      if (!hasFailureCount)         table.integer("failure_count").notNullable().defaultTo(0);
      if (!hasSuccessCount)         table.integer("success_count").notNullable().defaultTo(0);
      if (!hasConsecutiveFailures)  table.integer("consecutive_failures").notNullable().defaultTo(0);
      if (!hasLastFailureAt)        table.timestamp("last_failure_at", { useTz: true }).nullable();
      if (!hasLastSuccessAt)        table.timestamp("last_success_at", { useTz: true }).nullable();
      if (!hasCircuitOpen)          table.boolean("circuit_open").notNullable().defaultTo(false);
      if (!hasCircuitOpenedAt)      table.timestamp("circuit_opened_at", { useTz: true }).nullable();
      if (!hasCreatedAt)            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      if (!hasUpdatedAt)            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  // Only create indexes after columns are confirmed to exist
  const hasProviderCode = await knex.schema.hasColumn("provider_health_metrics", "provider_code");
  const hasCircuitOpen  = await knex.schema.hasColumn("provider_health_metrics", "circuit_open");

  if (hasProviderCode) {
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_phm_provider_code ON provider_health_metrics (provider_code)"
    );
  }

  if (hasCircuitOpen) {
    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_phm_circuit_open ON provider_health_metrics (circuit_open)"
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("provider_health_metrics");
}
