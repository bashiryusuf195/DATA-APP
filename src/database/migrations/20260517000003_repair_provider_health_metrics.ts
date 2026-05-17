import type { Knex } from "knex";

// provider_health_metrics is an existing partitioned table (relkind=p) from the
// initial schema with a different purpose (per-service latency/error-rate metrics).
// Circuit-breaker state lives in provider_circuit_state — see migration 20260517000004.
export async function up(_knex: Knex): Promise<void> {
  // no-op
}

export async function down(_knex: Knex): Promise<void> {
  // no-op
}
