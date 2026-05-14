import type { Knex } from "knex";

// ============================================================
// Migration 5 — System / Audit Tables
// Tables:
//   audit_logs, admin_activity_logs,
//   webhook_events, domain_events
//
// Partitioning:
//   audit_logs        → RANGE by created_at (monthly)
//   admin_activity_logs → RANGE by created_at (monthly)
//   webhook_events    → RANGE by created_at (monthly)
//   domain_events     → RANGE by occurred_at (monthly)
//
// All PKs on partitioned tables include the partition key
// column to satisfy PostgreSQL's requirement that UNIQUE
// constraints include all partition key columns.
// ============================================================

export async function up(knex: Knex): Promise<void> {
  // ── 1. Enums ───────────────────────────────────────────────
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE audit_action AS ENUM (
        'create', 'read', 'update', 'delete',
        'login', 'logout', 'login_failed',
        'password_change', 'password_reset',
        'kyc_submit', 'kyc_approve', 'kyc_reject',
        'wallet_credit', 'wallet_debit', 'wallet_freeze',
        'transaction_initiate', 'transaction_complete', 'transaction_fail', 'transaction_reverse',
        'role_assign', 'role_revoke',
        'permission_grant', 'permission_revoke',
        'provider_switch', 'config_change',
        'export', 'approve', 'reject', 'escalate'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE audit_outcome AS ENUM ('success', 'failure', 'partial');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE webhook_status AS ENUM (
        'pending', 'processing', 'delivered', 'failed', 'retrying', 'dead_letter'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE domain_event_status AS ENUM (
        'pending', 'processing', 'processed', 'failed', 'dead_letter'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  // ── 2. audit_logs (RANGE-partitioned by created_at) ───────
  // PK is (id, created_at) — PostgreSQL partition UNIQUE rule.
  // This is an append-only table. No UPDATE, no DELETE.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id              UUID          NOT NULL DEFAULT uuid_generate_v4(),
      actor_id        UUID          REFERENCES users(id) ON DELETE SET NULL,
      actor_type      TEXT          NOT NULL DEFAULT 'user',    -- 'user' | 'system' | 'api_key' | 'webhook'
      action          audit_action  NOT NULL,
      outcome         audit_outcome NOT NULL DEFAULT 'success',

      -- Target entity (polymorphic)
      resource_type   TEXT          NOT NULL,                   -- 'transaction' | 'wallet' | 'user' | ...
      resource_id     UUID,

      -- Change tracking
      old_values      JSONB         NOT NULL DEFAULT '{}',
      new_values      JSONB         NOT NULL DEFAULT '{}',
      diff            JSONB         NOT NULL DEFAULT '{}',      -- computed diff at write time

      -- Request context
      ip_address      INET,
      user_agent      TEXT,
      request_id      TEXT,                                     -- X-Request-ID / correlation ID
      session_id      UUID,
      device_id       UUID,

      error_message   TEXT,
      metadata        JSONB         NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

      -- Partition key must be part of PK
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`COMMENT ON TABLE audit_logs IS
    'Append-only immutable audit trail. RANGE partitioned by created_at (monthly).
     Never UPDATE or DELETE rows. Use pg_partman for partition lifecycle management.
     Retention policy: hot = 1 year, archive = 7 years (regulatory requirement).'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT
  `);

  // ── 3. admin_activity_logs (RANGE-partitioned by created_at)
  // Separate from audit_logs for admin-specific operations,
  // enabling fine-grained retention and access control.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS admin_activity_logs (
      id              UUID          NOT NULL DEFAULT uuid_generate_v4(),
      admin_id        UUID          NOT NULL REFERENCES users(id) ON DELETE SET NULL,
      action          TEXT          NOT NULL,
      description     TEXT          NOT NULL,
      resource_type   TEXT,
      resource_id     UUID,
      old_values      JSONB         NOT NULL DEFAULT '{}',
      new_values      JSONB         NOT NULL DEFAULT '{}',
      ip_address      INET,
      user_agent      TEXT,
      request_id      TEXT,
      outcome         audit_outcome NOT NULL DEFAULT 'success',
      error_message   TEXT,
      metadata        JSONB         NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

      -- Partition key must be part of PK
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`COMMENT ON TABLE admin_activity_logs IS
    'Admin-specific activity log. RANGE partitioned by created_at (monthly).
     Separate from audit_logs to allow different retention and access policies.'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS admin_activity_logs_default
      PARTITION OF admin_activity_logs DEFAULT
  `);

  // ── 4. webhook_events (RANGE-partitioned by created_at) ───
  // Outbound webhooks delivered to merchant/partner endpoints.
  // PK is (id, created_at) for partition UNIQUE compliance.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id              UUID           NOT NULL DEFAULT uuid_generate_v4(),
      -- Subscription / destination
      user_id         UUID           REFERENCES users(id) ON DELETE SET NULL,
      endpoint_url    TEXT           NOT NULL,
      secret_hash     TEXT,                         -- HMAC secret hash for signature verification
      event_type      TEXT           NOT NULL,       -- 'transaction.successful' | 'wallet.credited' | ...
      status          webhook_status NOT NULL DEFAULT 'pending',

      -- Payload
      payload         JSONB          NOT NULL DEFAULT '{}',
      headers         JSONB          NOT NULL DEFAULT '{}',

      -- Delivery tracking
      attempt_count   INTEGER        NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      max_attempts    INTEGER        NOT NULL DEFAULT 5,
      next_retry_at   TIMESTAMPTZ,
      last_attempt_at TIMESTAMPTZ,
      delivered_at    TIMESTAMPTZ,

      -- Response from endpoint
      response_status INTEGER,                      -- HTTP status code
      response_body   TEXT,
      response_time_ms INTEGER,

      -- Idempotency (event should be fired once per trigger)
      idempotency_key TEXT,

      error_message   TEXT,
      metadata        JSONB          NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

      -- Partition key must be part of PK
      PRIMARY KEY (id, created_at),

      CONSTRAINT webhook_max_attempts_valid CHECK (attempt_count <= max_attempts + 1)
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`COMMENT ON TABLE webhook_events IS
    'Outbound webhook delivery queue. RANGE partitioned by created_at (monthly).
     Worker polls pending/retrying rows ordered by next_retry_at.
     Dead-letter after max_attempts exceeded.'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS webhook_events_default PARTITION OF webhook_events DEFAULT
  `);

  // Idempotency index (partition-key aware)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_idempotency
    ON webhook_events (idempotency_key, created_at)
    WHERE idempotency_key IS NOT NULL
  `);

  // ── 5. domain_events (RANGE-partitioned by occurred_at) ───
  // Internal event bus persistence — event sourcing pattern.
  // Consumed by async processors, projectors, saga orchestrators.
  // Partition key: occurred_at
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS domain_events (
      id              UUID                NOT NULL DEFAULT uuid_generate_v4(),
      event_type      TEXT                NOT NULL,   -- 'TransactionCompleted' | 'WalletCredited' | ...
      aggregate_type  TEXT                NOT NULL,   -- 'Transaction' | 'Wallet' | 'User' | ...
      aggregate_id    UUID                NOT NULL,
      causation_id    UUID,                           -- event that caused this event
      correlation_id  UUID,                           -- request/saga correlation
      version         INTEGER             NOT NULL DEFAULT 1 CHECK (version > 0),
      payload         JSONB               NOT NULL DEFAULT '{}',
      metadata        JSONB               NOT NULL DEFAULT '{}',
      status          domain_event_status NOT NULL DEFAULT 'pending',
      processor_id    TEXT,                           -- which worker/node is processing
      processing_started_at TIMESTAMPTZ,
      processed_at    TIMESTAMPTZ,
      failed_at       TIMESTAMPTZ,
      retry_count     INTEGER             NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
      max_retries     INTEGER             NOT NULL DEFAULT 3,
      error_message   TEXT,
      occurred_at     TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

      -- Partition key (occurred_at) must be part of PK
      PRIMARY KEY (id, occurred_at),

      CONSTRAINT domain_event_retry_valid CHECK (retry_count <= max_retries + 1)
    ) PARTITION BY RANGE (occurred_at)
  `);

  await knex.raw(`COMMENT ON TABLE domain_events IS
    'Internal event bus persistence (event sourcing).
     RANGE partitioned by occurred_at (monthly).
     Consumers must be idempotent — events may be delivered at-least-once.
     Dead-letter after max_retries exceeded.
     Correlation_id links events across saga boundaries.'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS domain_events_default PARTITION OF domain_events DEFAULT
  `);

  // ── 6. Indexes ─────────────────────────────────────────────

  // audit_logs (indexes on parent propagate to partitions)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_actor         ON audit_logs (actor_id, created_at DESC) WHERE actor_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_resource      ON audit_logs (resource_type, resource_id, created_at DESC) WHERE resource_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_action        ON audit_logs (action, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_outcome       ON audit_logs (outcome, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_request_id    ON audit_logs (request_id) WHERE request_id IS NOT NULL`);

  // admin_activity_logs
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_admin_log_admin     ON admin_activity_logs (admin_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_admin_log_resource  ON admin_activity_logs (resource_type, resource_id) WHERE resource_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_admin_log_action    ON admin_activity_logs (action, created_at DESC)`);

  // webhook_events (hot path: worker polling)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_webhook_pending     ON webhook_events (status, next_retry_at) WHERE status IN ('pending', 'retrying')`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_webhook_user        ON webhook_events (user_id, created_at DESC) WHERE user_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_webhook_event_type  ON webhook_events (event_type, created_at DESC)`);

  // domain_events (hot path: consumer polling)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_domain_event_pending ON domain_events (status, occurred_at) WHERE status IN ('pending', 'failed')`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_domain_event_aggregate ON domain_events (aggregate_type, aggregate_id, occurred_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_domain_event_type   ON domain_events (event_type, occurred_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_domain_event_correlation ON domain_events (correlation_id) WHERE correlation_id IS NOT NULL`);
}

// ============================================================
// DOWN
// ============================================================
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS domain_events        CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS webhook_events       CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS admin_activity_logs  CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS audit_logs           CASCADE`);

  const enums = [
    "domain_event_status", "webhook_status", "audit_outcome", "audit_action",
  ];
  for (const e of enums) {
    await knex.raw(`DROP TYPE IF EXISTS ${e} CASCADE`);
  }
}
