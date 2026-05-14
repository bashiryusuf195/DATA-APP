import type { Knex } from "knex";

// ============================================================
// Migration 4 — Transactions
// Tables:
//   transactions, payments, refunds, reversals,
//   commissions, settlements, disputes
//
// Partitioning:
//   transactions → RANGE by created_at (monthly) — highest volume
//   payments     → RANGE by created_at (monthly)
//   All others   → non-partitioned (manageable volume)
//
// Migration order note:
//   wallet_ledger.reference_id can now be resolved to transactions.id
//   at app layer (no FK constraint from ledger → transactions — by design).
// ============================================================

export async function up(knex: Knex): Promise<void> {
  // ── 1. Enums ───────────────────────────────────────────────
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE transaction_type AS ENUM (
        'airtime_purchase',
        'data_purchase',
        'electricity_payment',
        'cable_tv_payment',
        'water_payment',
        'internet_payment',
        'education_payment',
        'insurance_payment',
        'betting_payment',
        'government_payment',
        'wallet_topup',
        'wallet_withdrawal',
        'wallet_transfer',
        'commission_payout',
        'refund',
        'reversal',
        'fee_charge',
        'settlement'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE transaction_status AS ENUM (
        'initiated',
        'pending',
        'processing',
        'successful',
        'failed',
        'reversed',
        'refunded',
        'disputed',
        'expired'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE payment_method AS ENUM (
        'wallet',
        'card',
        'bank_transfer',
        'ussd',
        'qr_code',
        'nfc',
        'bank_debit'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE payment_status AS ENUM (
        'pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE refund_status AS ENUM ('pending', 'approved', 'rejected', 'processed', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE reversal_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE dispute_status AS ENUM (
        'open', 'under_review', 'resolved_customer',
        'resolved_merchant', 'closed', 'escalated'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE commission_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE settlement_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  // ── 2. transactions (RANGE-partitioned by created_at) ─────
  // PK is (id, created_at) — required for PostgreSQL partitioned UNIQUE.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                UUID               NOT NULL DEFAULT uuid_generate_v4(),
      user_id           UUID               NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      wallet_id         UUID               REFERENCES wallets(id) ON DELETE RESTRICT,
      service_id        UUID               REFERENCES services(id) ON DELETE RESTRICT,
      provider_id       UUID               REFERENCES providers(id) ON DELETE RESTRICT,
      provider_service_id UUID             REFERENCES provider_services(id) ON DELETE SET NULL,

      transaction_type  transaction_type   NOT NULL,
      status            transaction_status NOT NULL DEFAULT 'initiated',

      amount            NUMERIC(18,2)      NOT NULL CHECK (amount > 0),
      fee               NUMERIC(18,2)      NOT NULL DEFAULT 0 CHECK (fee >= 0),
      net_amount        NUMERIC(18,2)      NOT NULL CHECK (net_amount > 0),  -- amount - fee
      currency          CHAR(3)            NOT NULL DEFAULT 'NGN',

      -- Beneficiary / recipient details
      beneficiary_phone TEXT,
      beneficiary_email TEXT,
      beneficiary_name  TEXT,
      beneficiary_account TEXT,            -- meter no, smart card no, account no, etc.
      beneficiary_meta  JSONB              NOT NULL DEFAULT '{}',

      -- Provider response
      provider_ref      TEXT,              -- provider's transaction reference
      provider_status   TEXT,
      provider_response JSONB              NOT NULL DEFAULT '{}',
      provider_token    TEXT,              -- token / PIN delivered to customer

      -- Idempotency
      idempotency_key   TEXT,

      -- Retry tracking
      retry_count       INTEGER            NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
      max_retries       INTEGER            NOT NULL DEFAULT 3,
      next_retry_at     TIMESTAMPTZ,

      -- Timing
      initiated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
      processed_at      TIMESTAMPTZ,
      completed_at      TIMESTAMPTZ,
      expires_at        TIMESTAMPTZ,
      created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

      metadata          JSONB              NOT NULL DEFAULT '{}',
      ip_address        INET,
      device_id         UUID               REFERENCES device_registry(id) ON DELETE SET NULL,
      channel           TEXT,              -- 'web' | 'mobile' | 'ussd' | 'api'

      -- Partition key must be part of PK
      PRIMARY KEY (id, created_at),

      CONSTRAINT txn_currency_fmt       CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT txn_net_amount_check   CHECK (net_amount = amount - fee),
      CONSTRAINT txn_retry_valid        CHECK (retry_count <= max_retries)
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`COMMENT ON TABLE transactions IS
    'RANGE partitioned by created_at (monthly).
     High-volume table — use pg_partman for automated partition management.
     Retention: hot partition = 6 months, cold = archive after 2 years.'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS transactions_default PARTITION OF transactions DEFAULT
  `);

  // Idempotency unique index — must include partition key per PostgreSQL rules
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_idempotency
    ON transactions (idempotency_key, created_at)
    WHERE idempotency_key IS NOT NULL
  `);

  // Provider ref unique per provider — include created_at for partition validity
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_provider_ref
    ON transactions (provider_id, provider_ref, created_at)
    WHERE provider_ref IS NOT NULL
  `);

  // ── 3. payments (RANGE-partitioned by created_at) ─────────
  // Captures the payment event that funds a transaction.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS payments (
      id              UUID           NOT NULL DEFAULT uuid_generate_v4(),
      transaction_id  UUID           NOT NULL,   -- refs transactions(id) at app layer; no FK across partitioned tables without including partition key
      user_id         UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      wallet_id       UUID           REFERENCES wallets(id) ON DELETE RESTRICT,

      payment_method  payment_method NOT NULL,
      status          payment_status NOT NULL DEFAULT 'pending',

      amount          NUMERIC(18,2)  NOT NULL CHECK (amount > 0),
      currency        CHAR(3)        NOT NULL DEFAULT 'NGN',
      fee             NUMERIC(18,2)  NOT NULL DEFAULT 0 CHECK (fee >= 0),

      -- Card / bank details (tokenized — never store raw PAN)
      payment_ref     TEXT,                      -- internal payment reference
      gateway_ref     TEXT,                      -- payment gateway reference
      gateway         TEXT,                      -- 'paystack' | 'flutterwave' | 'monnify'
      gateway_response JSONB         NOT NULL DEFAULT '{}',
      card_last4      CHAR(4),
      card_brand      TEXT,
      card_exp_month  SMALLINT,
      card_exp_year   SMALLINT,
      bank_code       TEXT,
      account_number  TEXT,                      -- masked

      authorization_code TEXT,
      channel         TEXT,

      initiated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      confirmed_at    TIMESTAMPTZ,
      failed_at       TIMESTAMPTZ,
      failure_reason  TEXT,
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      metadata        JSONB          NOT NULL DEFAULT '{}',

      -- Partition key must be part of PK
      PRIMARY KEY (id, created_at),

      CONSTRAINT payments_currency_fmt CHECK (currency ~ '^[A-Z]{3}$')
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`COMMENT ON TABLE payments IS
    'RANGE partitioned by created_at.
     transaction_id references transactions table but FK is not enforced
     at DB level across two independently-partitioned tables (PostgreSQL limitation).
     Enforce via application layer and periodic reconciliation jobs.'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS payments_default PARTITION OF payments DEFAULT
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_gateway_ref
    ON payments (gateway, gateway_ref, created_at)
    WHERE gateway_ref IS NOT NULL
  `);

  // ── 4. refunds ─────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS refunds (
      id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      transaction_id  UUID          NOT NULL,   -- polymorphic — resolved at app layer
      user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      wallet_id       UUID          REFERENCES wallets(id) ON DELETE RESTRICT,
      journal_batch_id UUID         REFERENCES wallet_journal_batches(id) ON DELETE SET NULL,

      status          refund_status NOT NULL DEFAULT 'pending',
      amount          NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      currency        CHAR(3)       NOT NULL DEFAULT 'NGN',
      reason          TEXT          NOT NULL,
      notes           TEXT,

      requested_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at     TIMESTAMPTZ,
      processed_at    TIMESTAMPTZ,
      failure_reason  TEXT,

      metadata        JSONB         NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

      CONSTRAINT refunds_currency_fmt CHECK (currency ~ '^[A-Z]{3}$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 5. reversals ───────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS reversals (
      id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
      transaction_id  UUID            NOT NULL,  -- resolved at app layer
      user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      journal_batch_id UUID           REFERENCES wallet_journal_batches(id) ON DELETE SET NULL,

      status          reversal_status NOT NULL DEFAULT 'pending',
      amount          NUMERIC(18,2)   NOT NULL CHECK (amount > 0),
      currency        CHAR(3)         NOT NULL DEFAULT 'NGN',
      reason          TEXT            NOT NULL,
      initiated_by    UUID            REFERENCES users(id) ON DELETE SET NULL,
      processed_at    TIMESTAMPTZ,
      failure_reason  TEXT,

      provider_reversal_ref TEXT,
      provider_response     JSONB    NOT NULL DEFAULT '{}',

      metadata        JSONB           NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

      CONSTRAINT reversals_currency_fmt CHECK (currency ~ '^[A-Z]{3}$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_reversals_updated_at
    BEFORE UPDATE ON reversals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 6. commissions ─────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS commissions (
      id                UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
      transaction_id    UUID              NOT NULL,   -- resolved at app layer
      beneficiary_id    UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      beneficiary_wallet_id UUID          REFERENCES wallets(id) ON DELETE SET NULL,
      journal_batch_id  UUID              REFERENCES wallet_journal_batches(id) ON DELETE SET NULL,

      status            commission_status NOT NULL DEFAULT 'pending',
      amount            NUMERIC(18,2)     NOT NULL CHECK (amount > 0),
      currency          CHAR(3)           NOT NULL DEFAULT 'NGN',
      rate              NUMERIC(7,4),                -- commission rate used
      commission_type   TEXT              NOT NULL DEFAULT 'agent',  -- 'agent' | 'referral' | 'platform'

      approved_by       UUID              REFERENCES users(id) ON DELETE SET NULL,
      approved_at       TIMESTAMPTZ,
      paid_at           TIMESTAMPTZ,
      cancelled_reason  TEXT,

      metadata          JSONB             NOT NULL DEFAULT '{}',
      created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

      CONSTRAINT commissions_currency_fmt CHECK (currency ~ '^[A-Z]{3}$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_commissions_updated_at
    BEFORE UPDATE ON commissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 7. settlements ─────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS settlements (
      id                UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
      provider_id       UUID              REFERENCES providers(id) ON DELETE RESTRICT,
      wallet_id         UUID              REFERENCES wallets(id) ON DELETE RESTRICT,
      journal_batch_id  UUID              REFERENCES wallet_journal_batches(id) ON DELETE SET NULL,

      status            settlement_status NOT NULL DEFAULT 'pending',
      amount            NUMERIC(18,2)     NOT NULL CHECK (amount > 0),
      currency          CHAR(3)           NOT NULL DEFAULT 'NGN',
      settlement_date   DATE              NOT NULL,
      period_start      TIMESTAMPTZ       NOT NULL,
      period_end        TIMESTAMPTZ       NOT NULL,
      transaction_count INTEGER           NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
      bank_code         TEXT,
      account_number    TEXT,
      account_name      TEXT,
      bank_reference    TEXT,
      notes             TEXT,
      processed_at      TIMESTAMPTZ,
      failure_reason    TEXT,

      metadata          JSONB             NOT NULL DEFAULT '{}',
      created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

      CONSTRAINT settlements_currency_fmt      CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT settlements_period_valid      CHECK (period_end > period_start)
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_settlements_updated_at
    BEFORE UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 8. disputes ────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS disputes (
      id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
      transaction_id  UUID           NOT NULL,  -- resolved at app layer
      user_id         UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assigned_to     UUID           REFERENCES users(id) ON DELETE SET NULL,
      refund_id       UUID           REFERENCES refunds(id) ON DELETE SET NULL,

      status          dispute_status NOT NULL DEFAULT 'open',
      subject         TEXT           NOT NULL,
      description     TEXT           NOT NULL,
      evidence_urls   TEXT[]         NOT NULL DEFAULT '{}',
      amount_disputed NUMERIC(18,2)  NOT NULL CHECK (amount_disputed > 0),
      currency        CHAR(3)        NOT NULL DEFAULT 'NGN',
      resolution_note TEXT,
      resolved_at     TIMESTAMPTZ,
      escalated_at    TIMESTAMPTZ,

      metadata        JSONB          NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

      CONSTRAINT disputes_currency_fmt CHECK (currency ~ '^[A-Z]{3}$')
    )
  `);

  await knex.raw(`
    CREATE TRIGGER trg_disputes_updated_at
    BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 9. Indexes ─────────────────────────────────────────────
  // transactions (hot paths — indexes on parent propagate to partitions)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_user_created    ON transactions (user_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_wallet          ON transactions (wallet_id, created_at DESC) WHERE wallet_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_status          ON transactions (status, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_type            ON transactions (transaction_type, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_service         ON transactions (service_id) WHERE service_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_provider        ON transactions (provider_id) WHERE provider_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_beneficiary     ON transactions (beneficiary_phone) WHERE beneficiary_phone IS NOT NULL`);

  // payments
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pay_user_created    ON payments (user_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pay_status          ON payments (status, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pay_method         ON payments (payment_method)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_pay_wallet          ON payments (wallet_id) WHERE wallet_id IS NOT NULL`);

  // refunds
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_refund_user         ON refunds (user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_refund_txn          ON refunds (transaction_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_refund_status       ON refunds (status)`);

  // reversals
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_reversal_user       ON reversals (user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_reversal_txn        ON reversals (transaction_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_reversal_status     ON reversals (status)`);

  // commissions
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_commission_user     ON commissions (beneficiary_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_commission_status   ON commissions (status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_commission_txn      ON commissions (transaction_id)`);

  // settlements
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_settlement_provider ON settlements (provider_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_settlement_status   ON settlements (status, settlement_date DESC)`);

  // disputes
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_dispute_user        ON disputes (user_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_dispute_status      ON disputes (status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_dispute_assigned    ON disputes (assigned_to) WHERE assigned_to IS NOT NULL`);
}

// ============================================================
// DOWN
// ============================================================
export async function down(knex: Knex): Promise<void> {
  const triggers: Array<[string, string]> = [
    ["trg_disputes_updated_at",    "disputes"],
    ["trg_settlements_updated_at", "settlements"],
    ["trg_commissions_updated_at", "commissions"],
    ["trg_reversals_updated_at",   "reversals"],
    ["trg_refunds_updated_at",     "refunds"],
  ];
  for (const [trg, tbl] of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trg} ON ${tbl}`);
  }

  await knex.raw(`DROP TABLE IF EXISTS disputes      CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS settlements   CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS commissions   CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS reversals     CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS refunds       CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS payments      CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS transactions  CASCADE`);

  const enums = [
    "settlement_status", "commission_status", "dispute_status",
    "reversal_status", "refund_status", "payment_status",
    "payment_method", "transaction_status", "transaction_type",
  ];
  for (const e of enums) {
    await knex.raw(`DROP TYPE IF EXISTS ${e} CASCADE`);
  }
}
