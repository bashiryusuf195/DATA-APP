import type { Knex } from "knex";

// ============================================================
// Migration 2 — Services / Providers
// Tables:
//   service_categories, services, providers,
//   provider_services, provider_health_metrics,
//   service_pricing, service_options
//
// Partitioning:
//   provider_health_metrics → RANGE by recorded_at (daily/weekly)
//   All others → non-partitioned
// ============================================================

export async function up(knex: Knex): Promise<void> {
  // ── 1. Enums ───────────────────────────────────────────────
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE service_category_type AS ENUM (
        'airtime', 'data', 'electricity', 'cable_tv', 'internet',
        'water', 'education', 'insurance', 'betting', 'toll',
        'government', 'remittance', 'other'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE service_status AS ENUM ('active', 'inactive', 'maintenance', 'deprecated');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE provider_status AS ENUM ('active', 'inactive', 'suspended', 'maintenance');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE pricing_model AS ENUM ('flat', 'percentage', 'tiered', 'markup');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE health_status AS ENUM ('healthy', 'degraded', 'down', 'unknown');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  // ── 2. service_categories ──────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS service_categories (
      id          UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
      name        TEXT                  NOT NULL UNIQUE,
      slug        TEXT                  NOT NULL UNIQUE,
      type        service_category_type NOT NULL,
      icon_url    TEXT,
      description TEXT,
      sort_order  INTEGER               NOT NULL DEFAULT 0,
      is_active   BOOLEAN               NOT NULL DEFAULT TRUE,
      metadata    JSONB                 NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),

      CONSTRAINT svc_cat_slug_fmt CHECK (slug ~ '^[a-z0-9_-]+$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_service_categories_updated_at
    BEFORE UPDATE ON service_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 3. services ────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS services (
      id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
      category_id     UUID           NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
      name            TEXT           NOT NULL,
      slug            TEXT           NOT NULL UNIQUE,
      code            TEXT           NOT NULL UNIQUE,   -- internal service code e.g. MTN_AIRTIME
      description     TEXT,
      icon_url        TEXT,
      status          service_status NOT NULL DEFAULT 'active',
      min_amount      NUMERIC(18,2)  CHECK (min_amount IS NULL OR min_amount >= 0),
      max_amount      NUMERIC(18,2)  CHECK (max_amount IS NULL OR max_amount >= 0),
      requires_phone  BOOLEAN        NOT NULL DEFAULT FALSE,
      requires_meter  BOOLEAN        NOT NULL DEFAULT FALSE,
      requires_smartcard BOOLEAN     NOT NULL DEFAULT FALSE,
      sort_order      INTEGER        NOT NULL DEFAULT 0,
      metadata        JSONB          NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

      CONSTRAINT services_amount_range CHECK (
        min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount
      ),
      CONSTRAINT services_slug_fmt CHECK (slug ~ '^[a-z0-9_-]+$'),
      CONSTRAINT services_code_fmt  CHECK (code ~ '^[A-Z0-9_]+$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 4. providers ───────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS providers (
      id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
      name                TEXT            NOT NULL UNIQUE,
      slug                TEXT            NOT NULL UNIQUE,
      code                TEXT            NOT NULL UNIQUE,   -- e.g. BAXI, VTPASS, PAYSTACK
      base_url            TEXT,
      webhook_url         TEXT,
      logo_url            TEXT,
      status              provider_status NOT NULL DEFAULT 'active',
      priority            INTEGER         NOT NULL DEFAULT 100,   -- lower = higher priority
      timeout_ms          INTEGER         NOT NULL DEFAULT 30000,
      retry_count         INTEGER         NOT NULL DEFAULT 3,
      api_key_encrypted   TEXT,                 -- encrypted at rest
      api_secret_encrypted TEXT,                -- encrypted at rest
      config              JSONB           NOT NULL DEFAULT '{}',  -- non-sensitive config
      metadata            JSONB           NOT NULL DEFAULT '{}',
      created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

      CONSTRAINT providers_priority_positive  CHECK (priority >= 0),
      CONSTRAINT providers_timeout_positive   CHECK (timeout_ms > 0),
      CONSTRAINT providers_retry_valid        CHECK (retry_count >= 0 AND retry_count <= 10),
      CONSTRAINT providers_slug_fmt           CHECK (slug ~ '^[a-z0-9_-]+$'),
      CONSTRAINT providers_code_fmt           CHECK (code ~ '^[A-Z0-9_]+$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_providers_updated_at
    BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 5. provider_services (routing map) ─────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS provider_services (
      id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      provider_id     UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      service_id      UUID        NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
      external_code   TEXT,                   -- provider's own service code/ID
      is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
      priority        INTEGER     NOT NULL DEFAULT 100,
      success_rate    NUMERIC(5,2) NOT NULL DEFAULT 100
                      CHECK (success_rate >= 0 AND success_rate <= 100),
      avg_response_ms INTEGER     NOT NULL DEFAULT 0,
      metadata        JSONB       NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT provider_services_unique UNIQUE (provider_id, service_id)
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_provider_services_updated_at
    BEFORE UPDATE ON provider_services
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 6. service_pricing ─────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS service_pricing (
      id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      service_id      UUID          NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      provider_id     UUID          REFERENCES providers(id) ON DELETE SET NULL,
      pricing_model   pricing_model NOT NULL DEFAULT 'flat',
      flat_fee        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (flat_fee >= 0),
      percentage_fee  NUMERIC(7,4)  NOT NULL DEFAULT 0 CHECK (percentage_fee >= 0),
      min_fee         NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (min_fee >= 0),
      max_fee         NUMERIC(18,2)           CHECK (max_fee IS NULL OR max_fee >= 0),
      tiers           JSONB         NOT NULL DEFAULT '[]',  -- for tiered pricing
      currency        CHAR(3)       NOT NULL DEFAULT 'NGN',
      is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
      effective_from  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      effective_until TIMESTAMPTZ,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

      CONSTRAINT pricing_currency_fmt CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT pricing_max_gte_min  CHECK (max_fee IS NULL OR max_fee >= min_fee)
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_service_pricing_updated_at
    BEFORE UPDATE ON service_pricing
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 7. service_options (e.g. data plans, cable packages) ───
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS service_options (
      id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      service_id      UUID        NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      name            TEXT        NOT NULL,
      code            TEXT        NOT NULL,             -- option/plan code
      amount          NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      validity_days   INTEGER,
      description     TEXT,
      is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
      sort_order      INTEGER     NOT NULL DEFAULT 0,
      metadata        JSONB       NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT service_options_unique UNIQUE (service_id, code)
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_service_options_updated_at
    BEFORE UPDATE ON service_options
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 8. provider_health_metrics (RANGE-partitioned) ────────
  // Partition key: recorded_at (daily or weekly buckets)
  // PK is (id, recorded_at) to satisfy PostgreSQL partition UNIQUE rule.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS provider_health_metrics (
      id              UUID          NOT NULL DEFAULT uuid_generate_v4(),
      provider_id     UUID          NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      service_id      UUID          REFERENCES services(id) ON DELETE SET NULL,
      status          health_status NOT NULL DEFAULT 'unknown',
      latency_ms      INTEGER       CHECK (latency_ms >= 0),
      success_count   INTEGER       NOT NULL DEFAULT 0 CHECK (success_count >= 0),
      failure_count   INTEGER       NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
      error_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0
                      CHECK (error_rate >= 0 AND error_rate <= 100),
      notes           TEXT,
      recorded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

      -- Partition key must be part of PK on partitioned tables
      PRIMARY KEY (id, recorded_at)
    ) PARTITION BY RANGE (recorded_at)
  `);

  await knex.raw(`COMMENT ON TABLE provider_health_metrics IS
    'RANGE partitioned by recorded_at (recommend daily partitions).
     Use pg_partman to auto-manage future partitions.
     Retention: keep 90 days of detailed metrics, aggregate older data.'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS provider_health_metrics_default
      PARTITION OF provider_health_metrics DEFAULT
  `);

  // ── 9. Indexes ─────────────────────────────────────────────
  // service_categories
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_svc_cat_type       ON service_categories (type)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_svc_cat_active      ON service_categories (is_active, sort_order)`);

  // services
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_services_category   ON services (category_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_services_status     ON services (status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_services_code       ON services (code)`);

  // providers
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_providers_status    ON providers (status, priority)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_providers_code      ON providers (code)`);

  // provider_services (hot path: routing queries)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_prov_svc_service    ON provider_services (service_id, is_active, priority)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_prov_svc_provider   ON provider_services (provider_id, is_active)`);

  // service_pricing
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pricing_service     ON service_pricing (service_id, is_active)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pricing_provider    ON service_pricing (provider_id) WHERE provider_id IS NOT NULL`);

  // service_options
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_svc_options_service ON service_options (service_id, is_active, sort_order)`);

  // provider_health_metrics (indexes on partitioned parent)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_health_provider_time ON provider_health_metrics (provider_id, recorded_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_health_status        ON provider_health_metrics (status, recorded_at DESC)`);
}

// ============================================================
// DOWN
// ============================================================
export async function down(knex: Knex): Promise<void> {
  const triggers: Array<[string, string]> = [
    ["trg_service_categories_updated_at", "service_categories"],
    ["trg_services_updated_at",           "services"],
    ["trg_providers_updated_at",          "providers"],
    ["trg_provider_services_updated_at",  "provider_services"],
    ["trg_service_pricing_updated_at",    "service_pricing"],
    ["trg_service_options_updated_at",    "service_options"],
  ];
  for (const [trg, tbl] of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trg} ON ${tbl}`);
  }

  await knex.raw(`DROP TABLE IF EXISTS provider_health_metrics  CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS service_options          CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS service_pricing          CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS provider_services        CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS providers                CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS services                 CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS service_categories       CASCADE`);

  const enums = ["health_status", "pricing_model", "provider_status", "service_status", "service_category_type"];
  for (const e of enums) {
    await knex.raw(`DROP TYPE IF EXISTS ${e} CASCADE`);
  }
}
