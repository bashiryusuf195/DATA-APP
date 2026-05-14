import type { Knex } from "knex";

// ============================================================
// Migration 1 — Auth / RBAC
// Tables (creation order):
//   users, user_profiles, roles, permissions,
//   role_permissions, user_roles, device_registry,
//   sessions, risk_scores, notifications
//
// device_registry MUST be created before sessions because
// sessions.device_id REFERENCES device_registry(id).
//
// Partitioning strategy:
//   sessions      → RANGE by created_at (monthly)
//   notifications → RANGE by created_at (monthly)
//   All other tables → non-partitioned (manageable cardinality)
//
// Supabase:
//   users.auth_id → references auth.users(id) in GoTrue schema.
//   FK is intentionally omitted here because auth schema is
//   managed by Supabase internally; we enforce at app layer.
// ============================================================

export async function up(knex: Knex): Promise<void> {
  // ── 0. Extensions ─────────────────────────────────────────
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

  // ── 1. Enums ───────────────────────────────────────────────
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_status AS ENUM (
        'pending_verification', 'active', 'suspended', 'deactivated', 'banned'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE kyc_level AS ENUM ('none', 'tier_1', 'tier_2', 'tier_3');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app', 'webhook');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'read');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE device_status AS ENUM ('active', 'revoked', 'blocked');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  // ── 2. set_updated_at trigger function (shared) ───────────
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$
  `);

  // ── 3. users ───────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS users (
      id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      auth_id               UUID        UNIQUE,           -- Supabase auth.users(id)
      email                 TEXT        NOT NULL UNIQUE,
      phone                 TEXT        UNIQUE,
      username              TEXT        UNIQUE,
      password_hash         TEXT,                         -- null when Supabase-only auth
      status                user_status NOT NULL DEFAULT 'pending_verification',
      kyc_level             kyc_level   NOT NULL DEFAULT 'none',
      is_email_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
      is_phone_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
      last_login_at         TIMESTAMPTZ,
      login_count           INTEGER     NOT NULL DEFAULT 0 CHECK (login_count >= 0),
      failed_login_attempts INTEGER     NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
      locked_until          TIMESTAMPTZ,
      referral_code         TEXT        UNIQUE,
      referred_by_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
      metadata              JSONB       NOT NULL DEFAULT '{}',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at            TIMESTAMPTZ,

      CONSTRAINT users_phone_e164  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{6,14}$'),
      CONSTRAINT users_username_fmt CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,30}$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 4. user_profiles ───────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name    TEXT,
      last_name     TEXT,
      display_name  TEXT,
      avatar_url    TEXT,
      date_of_birth DATE,
      gender        gender_type,
      address_line1 TEXT,
      address_line2 TEXT,
      city          TEXT,
      state         TEXT,
      country       CHAR(2),                  -- ISO 3166-1 alpha-2
      postal_code   TEXT,
      bio           TEXT,
      bvn           TEXT,                     -- Bank Verification Number (Nigeria)
      nin           TEXT,                     -- National ID Number (Nigeria)
      bvn_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
      nin_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
      preferences   JSONB       NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT profiles_country_fmt CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
      CONSTRAINT profiles_dob_past    CHECK (date_of_birth IS NULL OR date_of_birth < CURRENT_DATE)
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 5. roles ───────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS roles (
      id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      name        TEXT        NOT NULL UNIQUE,
      slug        TEXT        NOT NULL UNIQUE,
      description TEXT,
      is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
      is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT roles_slug_fmt CHECK (slug ~ '^[a-z0-9_]+$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.raw(`
    INSERT INTO roles (name, slug, description, is_system) VALUES
      ('Super Admin',   'super_admin',   'Full system access',                  TRUE),
      ('Admin',         'admin',         'Administrative access',               TRUE),
      ('Support Agent', 'support_agent', 'Customer support operations',         TRUE),
      ('Compliance',    'compliance',    'Compliance and KYC operations',        TRUE),
      ('Finance',       'finance',       'Financial reporting and settlements',  TRUE),
      ('Customer',      'customer',      'Standard customer role',              TRUE),
      ('Merchant',      'merchant',      'Merchant / business account',         TRUE),
      ('Agent',         'agent',         'Field agent role',                    TRUE)
    ON CONFLICT (slug) DO NOTHING
  `);

  // ── 6. permissions ─────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS permissions (
      id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
      resource    TEXT  NOT NULL,
      action      TEXT  NOT NULL,
      description TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT permissions_resource_action_unique UNIQUE (resource, action),
      CONSTRAINT permissions_action_valid CHECK (
        action IN ('create','read','update','delete','execute','approve','reject','export','*')
      )
    )
  `);

  // ── 7. role_permissions ────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id       UUID  NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
      permission_id UUID  NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      granted_by    UUID  REFERENCES users(id) ON DELETE SET NULL,

      PRIMARY KEY (role_id, permission_id)
    )
  `);

  // ── 8. user_roles ──────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id     UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
      expires_at  TIMESTAMPTZ,

      PRIMARY KEY (user_id, role_id)
    )
  `);

  // ── 9. device_registry ────────────────────────────────────
  // Must be created BEFORE sessions because sessions.device_id
  // references device_registry(id).
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS device_registry (
      id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id             UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_fingerprint  TEXT          NOT NULL,
      device_name         TEXT,
      device_type         TEXT          CHECK (device_type IN ('mobile','desktop','tablet','other')),
      os_name             TEXT,
      os_version          TEXT,
      app_version         TEXT,
      push_token          TEXT,
      ip_address          INET,
      status              device_status NOT NULL DEFAULT 'active',
      trusted_at          TIMESTAMPTZ,
      last_seen_at        TIMESTAMPTZ,
      metadata            JSONB         NOT NULL DEFAULT '{}',
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

      CONSTRAINT device_user_fingerprint_unique UNIQUE (user_id, device_fingerprint)
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_device_registry_updated_at
    BEFORE UPDATE ON device_registry
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 10. sessions (RANGE-partitioned by created_at) ────────
  // device_registry exists now, so device_id FK is a plain
  // (non-deferred) reference. PostgreSQL partition rule:
  // UNIQUE/PK must include all partition key columns.
  // PK is (id, created_at).
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sessions (
      id                 UUID        NOT NULL DEFAULT uuid_generate_v4(),
      user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash         TEXT        NOT NULL,
      refresh_token_hash TEXT,
      device_id          UUID        REFERENCES device_registry(id) ON DELETE SET NULL,
      ip_address         INET,
      user_agent         TEXT,
      is_revoked         BOOLEAN     NOT NULL DEFAULT FALSE,
      expires_at         TIMESTAMPTZ NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      -- Partition key (created_at) must be part of every UNIQUE/PK on partitioned tables
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`COMMENT ON TABLE sessions IS
    'RANGE partitioned by created_at (monthly). Use pg_partman to auto-create future partitions.
     device_registry is created before sessions so device_id carries a standard FK.'
  `);

  // Default catch-all partition
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sessions_default PARTITION OF sessions DEFAULT
  `);

  // ── 11. risk_scores ────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS risk_scores (
      id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score         NUMERIC(5,2)  NOT NULL DEFAULT 0
                    CHECK (score >= 0 AND score <= 100),
      risk_level    risk_level    NOT NULL DEFAULT 'low',
      factors       JSONB         NOT NULL DEFAULT '{}',
      model_version TEXT          NOT NULL DEFAULT 'v1',
      reviewed_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at   TIMESTAMPTZ,
      valid_until   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_risk_scores_updated_at
    BEFORE UPDATE ON risk_scores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 12. notifications (RANGE-partitioned by created_at) ───
  // PK is (id, created_at) to satisfy PostgreSQL partition UNIQUE rule.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notifications (
      id              UUID                 NOT NULL DEFAULT uuid_generate_v4(),
      user_id         UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title           TEXT                 NOT NULL,
      body            TEXT                 NOT NULL,
      channel         notification_channel NOT NULL DEFAULT 'in_app',
      status          notification_status  NOT NULL DEFAULT 'pending',
      reference_type  TEXT,
      reference_id    UUID,
      metadata        JSONB                NOT NULL DEFAULT '{}',
      scheduled_at    TIMESTAMPTZ,
      sent_at         TIMESTAMPTZ,
      read_at         TIMESTAMPTZ,
      failed_reason   TEXT,
      created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

      -- Partition key must be part of PK
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS notifications_default PARTITION OF notifications DEFAULT
  `);

  // ── 13. Indexes ────────────────────────────────────────────
  // Hot-path indexes on users
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_auth_id      ON users (auth_id)       WHERE auth_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_email        ON users (email)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_phone        ON users (phone)         WHERE phone IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_status       ON users (status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_kyc_level    ON users (kyc_level)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_created_at   ON users (created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_deleted_at   ON users (deleted_at)    WHERE deleted_at IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_users_email_trgm   ON users USING GIN (email gin_trgm_ops)`);

  // user_profiles
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_profiles_user_id   ON user_profiles (user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_profiles_country    ON user_profiles (country) WHERE country IS NOT NULL`);

  // sessions (indexes on parent propagate to partitions)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON sessions (user_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_token      ON sessions (token_hash)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_active     ON sessions (expires_at) WHERE is_revoked = FALSE`);

  // user_roles
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_user_roles_user     ON user_roles (user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_user_roles_role      ON user_roles (role_id)`);

  // device_registry
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_device_user_id      ON device_registry (user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_device_status        ON device_registry (status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_device_last_seen     ON device_registry (last_seen_at DESC)`);

  // risk_scores
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_risk_user_id        ON risk_scores (user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_risk_level           ON risk_scores (risk_level)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_risk_created_at      ON risk_scores (created_at DESC)`);

  // notifications
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_notif_user_status    ON notifications (user_id, status, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_notif_channel        ON notifications (channel, status)`);
}

// ============================================================
// DOWN
// ============================================================
export async function down(knex: Knex): Promise<void> {
  // Triggers
  const triggers: Array<[string, string]> = [
    ["trg_users_updated_at",            "users"],
    ["trg_user_profiles_updated_at",    "user_profiles"],
    ["trg_roles_updated_at",            "roles"],
    ["trg_device_registry_updated_at",  "device_registry"],
    ["trg_risk_scores_updated_at",      "risk_scores"],
  ];
  for (const [trg, tbl] of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trg} ON ${tbl}`);
  }

  // Tables (reverse dependency order)
  await knex.raw(`DROP TABLE IF EXISTS notifications    CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS risk_scores      CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS sessions         CASCADE`);  // must drop before device_registry
  await knex.raw(`DROP TABLE IF EXISTS device_registry  CASCADE`);  // device_registry created before sessions
  await knex.raw(`DROP TABLE IF EXISTS user_roles       CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS role_permissions CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS permissions      CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS roles            CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS user_profiles    CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS users            CASCADE`);

  // Function
  await knex.raw(`DROP FUNCTION IF EXISTS set_updated_at() CASCADE`);

  // Enums
  const enums = [
    "device_status", "risk_level", "notification_status",
    "notification_channel", "gender_type", "kyc_level", "user_status",
  ];
  for (const e of enums) {
    await knex.raw(`DROP TYPE IF EXISTS ${e} CASCADE`);
  }

  // Extensions (only drop if safe to do so — skip in shared DB environments)
  // await knex.raw(`DROP EXTENSION IF EXISTS "pg_trgm"`);
  // await knex.raw(`DROP EXTENSION IF EXISTS "pgcrypto"`);
  // await knex.raw(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
}
