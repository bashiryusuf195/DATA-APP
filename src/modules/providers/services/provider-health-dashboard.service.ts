import { getDbInstance } from "../../../db/knex";
import { logger } from "../../../lib/logger";

const db = getDbInstance();

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealthWindow = "1h" | "24h" | "7d";
export type ComputedHealthStatus = "healthy" | "degraded" | "down";

export interface ProviderWindowStats {
  provider_code:               string;
  name:                        string;
  is_active:                   boolean;
  priority:                    number;
  supported_services:          string[];
  config_health_status:        string;
  // Circuit breaker
  circuit_open:                boolean;
  consecutive_failures:        number;
  circuit_opened_at:           string | null;
  // Lifetime counters (from circuit state)
  lifetime_successes:          number;
  lifetime_failures:           number;
  // Window stats
  window:                      HealthWindow;
  total_attempts:              number;
  successful_attempts:         number;
  failed_attempts:             number;
  success_rate:                number | null;    // 0–100
  avg_latency_ms:              number | null;
  p95_latency_ms:              number | null;
  last_success_at:             string | null;
  last_failure_at:             string | null;
  recent_failure_reason:       string | null;
  recent_failure_classification: string | null;
  // Computed
  computed_health:             ComputedHealthStatus;
  protection_applied:          boolean;          // true if we auto-updated config_health_status
}

// ── SQL interval per window ───────────────────────────────────────────────────

const WINDOW_INTERVAL: Record<HealthWindow, string> = {
  "1h":  "1 hour",
  "24h": "24 hours",
  "7d":  "7 days",
};

// ── Health computation ────────────────────────────────────────────────────────

function computeHealthStatus(
  successRate:         number | null,
  totalAttempts:       number,
  circuitOpen:         boolean,
  consecutiveFailures: number,
): ComputedHealthStatus {
  // Circuit is definitively open — provider is at least degraded
  if (circuitOpen) {
    if (successRate === null || successRate < 70 || consecutiveFailures >= 5) return "down";
    return "degraded";
  }

  // No attempts in the window — fall back to circuit state
  if (totalAttempts === 0) {
    if (consecutiveFailures >= 5) return "down";
    if (consecutiveFailures >= 2) return "degraded";
    return "healthy";
  }

  if (successRate === null) return "healthy";
  if (successRate >= 95) return "healthy";
  if (successRate >= 70) return "degraded";
  return "down";
}

// ── Main query ────────────────────────────────────────────────────────────────

export async function getProviderHealthDashboard(options: {
  window?:       HealthWindow;
  service_type?: string;
  provider?:     string;
}): Promise<ProviderWindowStats[]> {
  const window      = options.window       ?? "1h";
  const interval    = WINDOW_INTERVAL[window];
  const serviceType = options.service_type ?? null;
  const provider    = options.provider     ?? null;

  // ── CTE: aggregate window stats ───────────────────────────────────────────
  const rows = await db.raw<{ rows: Array<Record<string, unknown>> }>(`
    WITH recent_failures AS (
      SELECT DISTINCT ON (provider_code)
        provider_code,
        error_message,
        error_classification
      FROM provider_attempts
      WHERE created_at > NOW() - INTERVAL '${interval}'
        AND success = false
        AND (error_classification IS NULL OR error_classification <> 'PENDING')
        ${serviceType ? `AND request_payload->>'service_type' = ?` : ''}
      ORDER BY provider_code, created_at DESC
    ),
    window_stats AS (
      SELECT
        provider_code,
        COUNT(*)                                                                        AS total,
        SUM(CASE WHEN success          THEN 1 ELSE 0 END)                              AS succeeded,
        SUM(CASE WHEN NOT success
                  AND (error_classification IS NULL
                       OR error_classification <> 'PENDING') THEN 1 ELSE 0 END)        AS failed_hard,
        ROUND(AVG(latency_ms))                                                          AS avg_lat,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))                AS p95_lat,
        MAX(CASE WHEN success     THEN created_at END)                                  AS last_ok,
        MAX(CASE WHEN NOT success THEN created_at END)                                  AS last_fail
      FROM provider_attempts
      WHERE created_at > NOW() - INTERVAL '${interval}'
        ${serviceType ? `AND request_payload->>'service_type' = ?` : ''}
      GROUP BY provider_code
    )
    SELECT
      pc.provider_code,
      pc.name,
      pc.is_active,
      pc.priority,
      pc.supported_services,
      pc.health_status                           AS config_health_status,
      COALESCE(pcs.circuit_open, false)          AS circuit_open,
      COALESCE(pcs.consecutive_failures, 0)      AS consecutive_failures,
      pcs.circuit_opened_at,
      COALESCE(pcs.success_count, 0)             AS lifetime_successes,
      COALESCE(pcs.failure_count, 0)             AS lifetime_failures,
      COALESCE(ws.total,        0)               AS total_attempts,
      COALESCE(ws.succeeded,    0)               AS successful_attempts,
      COALESCE(ws.failed_hard,  0)               AS failed_attempts,
      ROUND(
        100.0 * COALESCE(ws.succeeded, 0) / NULLIF(COALESCE(ws.total, 0), 0),
        1
      )                                          AS success_rate,
      ws.avg_lat                                 AS avg_latency_ms,
      ws.p95_lat                                 AS p95_latency_ms,
      ws.last_ok                                 AS last_success_at,
      ws.last_fail                               AS last_failure_at,
      rf.error_message                           AS recent_failure_reason,
      rf.error_classification                    AS recent_failure_classification
    FROM provider_configs pc
    LEFT JOIN provider_circuit_state pcs ON pcs.provider_code = pc.provider_code
    LEFT JOIN window_stats            ws  ON ws.provider_code  = pc.provider_code
    LEFT JOIN recent_failures         rf  ON rf.provider_code  = pc.provider_code
    ${provider ? `WHERE pc.provider_code = ?` : ''}
    ORDER BY pc.priority ASC, pc.provider_code ASC
  `, buildParams(serviceType, provider));

  const results: ProviderWindowStats[] = [];

  for (const row of rows.rows) {
    const successRate    = row.success_rate  != null ? Number(row.success_rate)  : null;
    const totalAttempts  = Number(row.total_attempts  ?? 0);
    const circuitOpen    = Boolean(row.circuit_open);
    const consec         = Number(row.consecutive_failures ?? 0);

    const computed = computeHealthStatus(successRate, totalAttempts, circuitOpen, consec);

    results.push({
      provider_code:                 row.provider_code as string,
      name:                          row.name as string,
      is_active:                     Boolean(row.is_active),
      priority:                      Number(row.priority ?? 0),
      supported_services:            (row.supported_services as string[]) ?? [],
      config_health_status:          row.config_health_status as string,
      circuit_open:                  circuitOpen,
      consecutive_failures:          consec,
      circuit_opened_at:             row.circuit_opened_at ? new Date(row.circuit_opened_at as string).toISOString() : null,
      lifetime_successes:            Number(row.lifetime_successes ?? 0),
      lifetime_failures:             Number(row.lifetime_failures  ?? 0),
      window,
      total_attempts:                totalAttempts,
      successful_attempts:           Number(row.successful_attempts ?? 0),
      failed_attempts:               Number(row.failed_attempts     ?? 0),
      success_rate:                  successRate,
      avg_latency_ms:                row.avg_latency_ms  != null ? Number(row.avg_latency_ms)  : null,
      p95_latency_ms:                row.p95_latency_ms  != null ? Number(row.p95_latency_ms)  : null,
      last_success_at:               row.last_success_at ? new Date(row.last_success_at as string).toISOString() : null,
      last_failure_at:               row.last_failure_at ? new Date(row.last_failure_at as string).toISOString() : null,
      recent_failure_reason:         (row.recent_failure_reason         as string | null) ?? null,
      recent_failure_classification: (row.recent_failure_classification as string | null) ?? null,
      computed_health:               computed,
      protection_applied:            false,
    });
  }

  // ── Auto-protection: soft-downgrade healthy providers that are computed 'down' ──
  // We only update config to 'degraded' (never permanently 'unhealthy') so that
  // routing can avoid them while admin reviews. Admin must explicitly disable.
  await applyProviderProtection(results);

  return results;
}

function buildParams(serviceType: string | null, provider: string | null): Array<string | number | boolean | Date | null> {
  const params: string[] = [];
  if (serviceType) { params.push(serviceType); params.push(serviceType); } // used in two CTEs
  if (provider)   params.push(provider);
  return params;
}

async function applyProviderProtection(rows: ProviderWindowStats[]): Promise<void> {
  for (const row of rows) {
    if (row.computed_health === "down" && row.config_health_status === "healthy") {
      try {
        await db("provider_configs")
          .where({ provider_code: row.provider_code })
          .update({ health_status: "degraded", updated_at: new Date() });
        row.config_health_status = "degraded";
        row.protection_applied   = true;
        logger.warn("provider_health_protection_applied", {
          provider_code: row.provider_code,
          computed:      "down",
          previous:      "healthy",
          action:        "auto-downgraded to degraded",
        });
      } catch (err) {
        logger.error("provider_health_protection_failed", {
          provider_code: row.provider_code,
          error:         (err as Error).message,
        });
      }
    }
  }
}
