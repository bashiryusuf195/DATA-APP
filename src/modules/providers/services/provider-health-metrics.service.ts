import { getDbInstance } from "../../../db/knex";
import { sendAdminPushNotification, checkAndUpdateCooldown } from "../../notifications/services/admin-push.service";

const db = getDbInstance();

const CIRCUIT_OPEN_THRESHOLD = parseInt(process.env["CIRCUIT_BREAKER_THRESHOLD"] ?? "5", 10);
const CIRCUIT_COOLDOWN_MS    = parseInt(process.env["CIRCUIT_BREAKER_COOLDOWN_MS"] ?? "300000", 10);

export interface ProviderHealthMetrics {
  id:                   number;
  provider_code:        string;
  failure_count:        number;
  success_count:        number;
  consecutive_failures: number;
  last_failure_at:      Date | null;
  last_success_at:      Date | null;
  circuit_open:         boolean;
  circuit_opened_at:    Date | null;
  created_at:           Date;
  updated_at:           Date;
}

// ── Write ──────────────────────────────────────────────────────────────────────

export async function recordSuccess(providerCode: string): Promise<void> {
  await db.raw(
    `INSERT INTO provider_circuit_state
       (provider_code, failure_count, success_count, consecutive_failures,
        last_success_at, circuit_open, circuit_opened_at, created_at, updated_at)
     VALUES (?, 0, 1, 0, NOW(), false, NULL, NOW(), NOW())
     ON CONFLICT (provider_code) DO UPDATE SET
       success_count        = provider_circuit_state.success_count + 1,
       consecutive_failures = 0,
       last_success_at      = NOW(),
       circuit_open         = false,
       circuit_opened_at    = CASE
                                WHEN provider_circuit_state.circuit_open THEN NULL
                                ELSE provider_circuit_state.circuit_opened_at
                              END,
       updated_at           = NOW()`,
    [providerCode]
  );
}

export async function recordFailure(providerCode: string): Promise<void> {
  await db.raw(
    `INSERT INTO provider_circuit_state
       (provider_code, failure_count, success_count, consecutive_failures,
        last_failure_at, circuit_open, circuit_opened_at, created_at, updated_at)
     VALUES (?, 1, 0, 1, NOW(), CASE WHEN 1 >= ? THEN true ELSE false END,
             CASE WHEN 1 >= ? THEN NOW() ELSE NULL END, NOW(), NOW())
     ON CONFLICT (provider_code) DO UPDATE SET
       failure_count        = provider_circuit_state.failure_count + 1,
       consecutive_failures = provider_circuit_state.consecutive_failures + 1,
       last_failure_at      = NOW(),
       circuit_open         = CASE
                                WHEN provider_circuit_state.consecutive_failures + 1 >= ? THEN true
                                ELSE provider_circuit_state.circuit_open
                              END,
       circuit_opened_at    = CASE
                                WHEN provider_circuit_state.consecutive_failures + 1 >= ?
                                     AND NOT provider_circuit_state.circuit_open
                                THEN NOW()
                                ELSE provider_circuit_state.circuit_opened_at
                              END,
       updated_at           = NOW()`,
    [providerCode, CIRCUIT_OPEN_THRESHOLD, CIRCUIT_OPEN_THRESHOLD,
     CIRCUIT_OPEN_THRESHOLD, CIRCUIT_OPEN_THRESHOLD]
  );

  // Alert admins when the circuit just tripped open (10-min cooldown per provider)
  const state = await db("provider_circuit_state")
    .where({ provider_code: providerCode })
    .first<{ circuit_open: boolean; consecutive_failures: number } | undefined>();

  if (state?.circuit_open) {
    const shouldSend = await checkAndUpdateCooldown(
      "provider_circuit_open",
      providerCode,
      10,
    ).catch(() => false);

    if (shouldSend) {
      sendAdminPushNotification({
        title:             "Provider Alert",
        body:              `${providerCode} has ${state.consecutive_failures} consecutive failures — circuit open.`,
        deep_link:         `/health-metrics`,
        notification_type: "admin_provider_alert",
        preference_key:    "admin_provider_alerts",
        metadata: {
          provider_code:        providerCode,
          consecutive_failures: String(state.consecutive_failures),
        },
      }).catch(() => {});
    }
  }
}

export async function resetCircuit(providerCode: string): Promise<void> {
  await db("provider_circuit_state")
    .where({ provider_code: providerCode })
    .update({
      circuit_open:         false,
      circuit_opened_at:    null,
      consecutive_failures: 0,
      updated_at:           new Date(),
    });
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function isCircuitOpen(providerCode: string): Promise<boolean> {
  const row = await db("provider_circuit_state")
    .where({ provider_code: providerCode })
    .first();

  if (!row || !row.circuit_open) return false;

  // Auto-recover: if past cooldown, treat as half-open (allow attempt through)
  if (row.circuit_opened_at) {
    const openedAt  = new Date(row.circuit_opened_at as string).getTime();
    const elapsed   = Date.now() - openedAt;
    if (elapsed >= CIRCUIT_COOLDOWN_MS) {
      console.log(
        `[CIRCUIT BREAKER] Provider '${providerCode}' past cooldown — half-open, allowing attempt`
      );
      return false;
    }
  }

  return true;
}

export async function listHealthMetrics(): Promise<ProviderHealthMetrics[]> {
  const rows = await db("provider_circuit_state").orderBy("provider_code", "asc");
  return rows.map(coerce);
}

export async function getHealthMetrics(
  providerCode: string
): Promise<ProviderHealthMetrics | null> {
  const row = await db("provider_circuit_state")
    .where({ provider_code: providerCode })
    .first();
  return row ? coerce(row) : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function coerce(row: Record<string, unknown>): ProviderHealthMetrics {
  return {
    id:                   Number(row.id),
    provider_code:        row.provider_code as string,
    failure_count:        Number(row.failure_count),
    success_count:        Number(row.success_count),
    consecutive_failures: Number(row.consecutive_failures),
    last_failure_at:      row.last_failure_at ? new Date(row.last_failure_at as string) : null,
    last_success_at:      row.last_success_at ? new Date(row.last_success_at as string) : null,
    circuit_open:         row.circuit_open as boolean,
    circuit_opened_at:    row.circuit_opened_at ? new Date(row.circuit_opened_at as string) : null,
    created_at:           new Date(row.created_at as string),
    updated_at:           new Date(row.updated_at as string),
  };
}
