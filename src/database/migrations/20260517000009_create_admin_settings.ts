import type { Knex } from "knex";

const SETTINGS: Array<{
  key: string; value: string; value_type: string;
  label: string; description: string; category: string; is_secret: boolean;
}> = [
  // ── General ─────────────────────────────────────────────────────────────────
  { key: "platform_name",           value: "VTU Platform",        value_type: "text",    label: "Platform Name",                category: "general",      is_secret: false, description: "Name of the platform shown in emails and notifications" },
  { key: "support_email",           value: "support@vtu.platform",value_type: "text",    label: "Support Email",                category: "general",      is_secret: false, description: "Email address for user support enquiries" },
  { key: "support_phone",           value: "+2340000000000",       value_type: "text",    label: "Support Phone",                category: "general",      is_secret: false, description: "Phone number for user support (E.164 format)" },
  { key: "default_currency",        value: "NGN",                  value_type: "text",    label: "Default Currency",             category: "general",      is_secret: false, description: "ISO 4217 currency code used for display and calculations" },
  { key: "min_transaction_amount",  value: "50",                   value_type: "number",  label: "Min Transaction Amount (₦)",   category: "general",      is_secret: false, description: "Minimum allowed transaction amount in naira" },
  { key: "max_transaction_amount",  value: "500000",               value_type: "number",  label: "Max Transaction Amount (₦)",   category: "general",      is_secret: false, description: "Maximum allowed single transaction amount in naira" },
  { key: "daily_transaction_limit", value: "5000000",              value_type: "number",  label: "Daily Transaction Limit (₦)",  category: "general",      is_secret: false, description: "Per-user daily spend cap in naira" },
  // ── Provider ────────────────────────────────────────────────────────────────
  { key: "provider_retry_count",        value: "3",     value_type: "number", label: "Retry Count",                    category: "provider", is_secret: false, description: "Number of times to retry a failed provider request" },
  { key: "provider_timeout_ms",         value: "30000", value_type: "number", label: "Request Timeout (ms)",           category: "provider", is_secret: false, description: "Maximum wait time per provider API call in milliseconds" },
  { key: "provider_circuit_threshold",  value: "5",     value_type: "number", label: "Circuit Breaker Threshold",      category: "provider", is_secret: false, description: "Consecutive failures before circuit opens" },
  { key: "provider_circuit_recovery_ms",value: "60000", value_type: "number", label: "Circuit Recovery Time (ms)",     category: "provider", is_secret: false, description: "How long a tripped circuit stays open before half-open test" },
  // ── Wallet ──────────────────────────────────────────────────────────────────
  { key: "min_funding_amount",   value: "100",     value_type: "number",  label: "Minimum Funding Amount (₦)",  category: "wallet", is_secret: false, description: "Smallest wallet top-up amount accepted" },
  { key: "max_funding_amount",   value: "5000000", value_type: "number",  label: "Maximum Funding Amount (₦)",  category: "wallet", is_secret: false, description: "Largest single wallet top-up allowed" },
  { key: "reversal_window_hours",value: "24",      value_type: "number",  label: "Reversal Window (hours)",     category: "wallet", is_secret: false, description: "How long after a transaction a reversal can be initiated" },
  { key: "ledger_strict_mode",   value: "false",   value_type: "boolean", label: "Ledger Strict Mode",          category: "wallet", is_secret: false, description: "Reject journal batches that do not balance to zero" },
  // ── Security ────────────────────────────────────────────────────────────────
  { key: "access_token_ttl_minutes",  value: "15",   value_type: "number",  label: "Access Token TTL (minutes)",  category: "security", is_secret: false, description: "JWT access token lifetime in minutes" },
  { key: "refresh_token_ttl_days",    value: "30",   value_type: "number",  label: "Refresh Token TTL (days)",    category: "security", is_secret: false, description: "Refresh token lifetime in days" },
  { key: "session_timeout_minutes",   value: "60",   value_type: "number",  label: "Session Timeout (minutes)",   category: "security", is_secret: false, description: "Idle session duration before automatic logout" },
  { key: "max_login_attempts",        value: "5",    value_type: "number",  label: "Max Login Attempts",          category: "security", is_secret: false, description: "Failed attempts before account is temporarily locked" },
  { key: "admin_ip_whitelist",        value: "[]",   value_type: "json",    label: "Admin IP Whitelist",          category: "security", is_secret: false, description: "JSON array of allowed admin IPs. Empty array disables whitelist." },
  // ── Notification ────────────────────────────────────────────────────────────
  { key: "email_notifications_enabled", value: "true",  value_type: "boolean", label: "Email Notifications",          category: "notification", is_secret: false, description: "Send transactional emails to users" },
  { key: "sms_notifications_enabled",   value: "true",  value_type: "boolean", label: "SMS Notifications",            category: "notification", is_secret: false, description: "Send transactional SMS to users" },
  { key: "push_notifications_enabled",  value: "false", value_type: "boolean", label: "Push Notifications",           category: "notification", is_secret: false, description: "Send mobile push notifications" },
  { key: "webhook_retry_enabled",        value: "true",  value_type: "boolean", label: "Webhook Retry on Failure",     category: "notification", is_secret: false, description: "Automatically retry failed outbound webhook deliveries" },
  { key: "webhook_max_retries",          value: "3",     value_type: "number",  label: "Webhook Max Retries",          category: "notification", is_secret: false, description: "Maximum delivery attempts per webhook event" },
  // ── Queue ────────────────────────────────────────────────────────────────────
  { key: "queue_max_attempts",    value: "3",    value_type: "number", label: "Max Job Attempts",          category: "queue", is_secret: false, description: "Total attempts before a job is moved to dead letter queue" },
  { key: "queue_backoff_ms",      value: "5000", value_type: "number", label: "Retry Backoff (ms)",        category: "queue", is_secret: false, description: "Initial delay between retry attempts (exponential)" },
  { key: "queue_concurrency",     value: "5",    value_type: "number", label: "Worker Concurrency",        category: "queue", is_secret: false, description: "Number of jobs processed simultaneously per worker" },
  { key: "dead_letter_threshold", value: "10",   value_type: "number", label: "Dead Letter Threshold",     category: "queue", is_secret: false, description: "Alert threshold for dead letter queue depth" },
  // ── Maintenance ──────────────────────────────────────────────────────────────
  { key: "maintenance_mode",    value: "false",  value_type: "boolean", label: "Maintenance Mode",    category: "maintenance", is_secret: false, description: "Take the entire platform offline for maintenance" },
  { key: "maintenance_message", value: "The platform is currently undergoing scheduled maintenance. We will be back shortly.", value_type: "text", label: "Maintenance Message", category: "maintenance", is_secret: false, description: "Message shown to users when maintenance mode is active" },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key         TEXT        PRIMARY KEY,
      value       TEXT        NOT NULL DEFAULT '',
      value_type  TEXT        NOT NULL DEFAULT 'text'
                  CHECK (value_type IN ('text', 'number', 'boolean', 'json')),
      label       TEXT        NOT NULL DEFAULT '',
      description TEXT,
      category    TEXT        NOT NULL DEFAULT 'general',
      is_secret   BOOLEAN     NOT NULL DEFAULT FALSE,
      updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_admin_settings_category
      ON admin_settings (category)
  `);

  await knex("admin_settings")
    .insert(SETTINGS)
    .onConflict("key")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS admin_settings`);
}
