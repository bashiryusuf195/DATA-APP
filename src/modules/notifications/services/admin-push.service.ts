import { getDbInstance } from "../../../db/knex";
import { sendPushToUsers } from "./fcm.service";
import type { PushPayload } from "./fcm.service";
import { logger } from "../../../lib/logger";

const db = getDbInstance();

// ── Schema bootstrap ───────────────────────────────────────────────────────────
// Idempotent — runs once per process, creates the cooldown table and any missing
// admin-specific preference columns. Uses PostgreSQL's IF NOT EXISTS so it never
// clobbers existing data.

let _schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  _schemaReady = true;

  await db.raw(`
    CREATE TABLE IF NOT EXISTS admin_notification_cooldowns (
      id         BIGSERIAL PRIMARY KEY,
      event_type TEXT        NOT NULL,
      scope_key  TEXT        NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (event_type, scope_key)
    )
  `);

  const adminCols = [
    "admin_transaction_failures",
    "admin_provider_alerts",
    "admin_support_messages",
    "admin_payment_alerts",
    "admin_security_events",
    "admin_system_alerts",
  ] as const;

  for (const col of adminCols) {
    await db.raw(
      `ALTER TABLE notification_preferences
         ADD COLUMN IF NOT EXISTS ${col} BOOLEAN NOT NULL DEFAULT true`,
    );
  }
}

// ── Admin user resolution ──────────────────────────────────────────────────────

export async function getAdminUserIds(): Promise<string[]> {
  const rows = await db("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .whereIn("r.slug", ["admin", "super_admin"])
    .where(function () {
      this.whereNull("ur.expires_at").orWhere("ur.expires_at", ">", db.fn.now());
    })
    .distinct("ur.user_id")
    .select<{ user_id: string }[]>("ur.user_id");
  return rows.map((r) => r.user_id);
}

// ── Cooldown gate ──────────────────────────────────────────────────────────────
// Returns true when the notification should be sent (no active cooldown).
// Updates the cooldown expiry on send.

export async function checkAndUpdateCooldown(
  eventType: string,
  scopeKey:  string,
  ttlMinutes: number,
): Promise<boolean> {
  const now = new Date();

  const existing = await db("admin_notification_cooldowns")
    .where({ event_type: eventType, scope_key: scopeKey })
    .first<{ expires_at: string } | undefined>();

  if (existing && new Date(existing.expires_at) > now) {
    return false;
  }

  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
  await db("admin_notification_cooldowns")
    .insert({ event_type: eventType, scope_key: scopeKey, expires_at: expiresAt })
    .onConflict(["event_type", "scope_key"])
    .merge({ expires_at: expiresAt });

  return true;
}

// ── Admin preference column names ──────────────────────────────────────────────

export type AdminPrefKey =
  | "admin_transaction_failures"
  | "admin_provider_alerts"
  | "admin_support_messages"
  | "admin_payment_alerts"
  | "admin_security_events"
  | "admin_system_alerts";

async function prefEnabled(userId: string, key: AdminPrefKey): Promise<boolean> {
  const row = await db("notification_preferences")
    .where({ user_id: userId })
    .first<Record<string, unknown> | undefined>();
  if (!row) return true;
  return row[key] !== false;
}

// ── Main helper ────────────────────────────────────────────────────────────────

export interface AdminPushOptions extends PushPayload {
  preference_key?: AdminPrefKey;
}

export async function sendAdminPushNotification(
  options: AdminPushOptions,
): Promise<void> {
  try {
    await ensureSchema();
    const allAdminIds = await getAdminUserIds();
    if (allAdminIds.length === 0) return;

    let recipients = allAdminIds;
    if (options.preference_key) {
      const key = options.preference_key;
      const checks = await Promise.all(
        allAdminIds.map((id) => prefEnabled(id, key).then((ok) => ({ id, ok }))),
      );
      recipients = checks.filter((c) => c.ok).map((c) => c.id);
    }

    if (recipients.length === 0) return;

    const { preference_key: _dropped, ...pushPayload } = options;
    const result = await sendPushToUsers(recipients, pushPayload);

    logger.info("admin_push_sent", {
      notification_type: pushPayload.notification_type,
      sent:              result.sent,
      failed:            result.failed,
      recipients:        recipients.length,
    });
  } catch (err) {
    logger.warn("admin_push_error", {
      notification_type: options.notification_type,
      error:             (err as Error).message,
    });
  }
}
