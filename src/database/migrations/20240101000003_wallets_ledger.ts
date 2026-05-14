import type { Knex } from "knex";

// ============================================================
// Migration 3 — Wallets / Ledger
// Tables:
//   wallets, wallet_journal_batches, wallet_ledger
//
// Design principles:
//   1. NO stored balance on wallets — balance is always derived
//      from wallet_ledger via:
//      SUM(amount) WHERE entry_type = 'credit'
//      - SUM(amount) WHERE entry_type = 'debit'
//      Use the view v_wallet_balances (created below) for reads.
//
//   2. Proper double-entry accounting:
//      Every economic event produces a journal_batch with >= 2
//      ledger entries where SUM of signed_amount = 0.
//      (credits are positive, debits are negative)
//
//   3. wallet_ledger does NOT reference transactions table
//      (transactions table does not exist yet). The reference
//      is captured via reference_type / reference_id (polymorphic)
//      and backfilled once Migration 4 runs.
//
// Partitioning:
//   wallet_ledger → RANGE by created_at (monthly)
//   PK is (id, created_at) to satisfy PostgreSQL partition rules.
// ============================================================

export async function up(knex: Knex): Promise<void> {
  // ── 1. Enums ───────────────────────────────────────────────
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE wallet_type AS ENUM (
        'user',        -- end-user consumer wallet
        'merchant',    -- business / merchant wallet
        'agent',       -- agent wallet
        'commission',  -- commission pool
        'escrow',      -- escrow holding wallet
        'fee',         -- platform fee collection
        'settlement'   -- settlement wallet
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE wallet_status AS ENUM ('active', 'suspended', 'frozen', 'closed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE journal_status AS ENUM ('pending', 'posted', 'reversed', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  // ── 2. wallets ─────────────────────────────────────────────
  // NOTE: No balance columns. Balance = SUM from wallet_ledger.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS wallets (
      id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           UUID          REFERENCES users(id) ON DELETE RESTRICT,
      wallet_type       wallet_type   NOT NULL DEFAULT 'user',
      currency          CHAR(3)       NOT NULL DEFAULT 'NGN',
      status            wallet_status NOT NULL DEFAULT 'active',

      -- Limits (policy-level, not enforced by DB — enforced at application layer)
      daily_debit_limit   NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (daily_debit_limit >= 0),
      monthly_debit_limit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (monthly_debit_limit >= 0),
      single_txn_limit    NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (single_txn_limit >= 0),

      -- Overdraft (0 = no overdraft allowed)
      overdraft_limit   NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (overdraft_limit >= 0),

      is_default        BOOLEAN       NOT NULL DEFAULT FALSE,
      label             TEXT,
      metadata          JSONB         NOT NULL DEFAULT '{}',
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

      CONSTRAINT wallets_currency_fmt   CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT wallets_user_required  CHECK (
        -- system wallets (commission, fee, settlement) may have null user_id
        user_id IS NOT NULL OR wallet_type IN ('commission', 'fee', 'settlement', 'escrow')
      )
    )
  `);

  await knex.raw(`COMMENT ON TABLE wallets IS
    'No balance columns. Account balance is always computed from wallet_ledger.
     Use view v_wallet_balances for current balance reads.'
  `);

  await knex.raw(`
    CREATE TRIGGER trg_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // Ensure each user has at most one default wallet per currency
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_default_per_user
    ON wallets (user_id, currency)
    WHERE is_default = TRUE AND user_id IS NOT NULL
  `);

  // ── 3. wallet_journal_batches ──────────────────────────────
  // Groups the >= 2 ledger lines of a single economic event.
  // Enforces: SUM(signed_amount) = 0 across all entries via
  //           application-layer validation + DB check trigger.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS wallet_journal_batches (
      id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
      status          journal_status NOT NULL DEFAULT 'pending',
      description     TEXT           NOT NULL,
      reference_type  TEXT,          -- 'transaction' | 'topup' | 'withdrawal' | 'reversal' | 'fee'
      reference_id    UUID,          -- polymorphic FK; resolved at application layer
      idempotency_key TEXT           UNIQUE,   -- prevent duplicate journal posting
      posted_at       TIMESTAMPTZ,
      reversed_at     TIMESTAMPTZ,
      reversed_by     UUID           REFERENCES users(id) ON DELETE SET NULL,
      reversal_batch_id UUID         REFERENCES wallet_journal_batches(id) ON DELETE RESTRICT,
      metadata        JSONB          NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    )
  `);

  await knex.raw(`COMMENT ON TABLE wallet_journal_batches IS
    'Each batch represents one balanced economic event.
     All linked wallet_ledger entries must sum to zero (debits = credits).
     Enforced at application layer via service-level transaction.'
  `);

  await knex.raw(`
    CREATE TRIGGER trg_journal_batches_updated_at
    BEFORE UPDATE ON wallet_journal_batches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // ── 4. wallet_ledger (RANGE-partitioned by created_at) ────
  // Double-entry: every row is either a debit or credit line.
  // signed_amount: credits > 0, debits < 0.
  // For each journal_batch: SUM(signed_amount) MUST = 0.
  //
  // PostgreSQL partition rules:
  //   - UNIQUE/PK must include the partition key (created_at).
  //   - FK from wallet_ledger to wallet_journal_batches is fine
  //     because wallet_journal_batches is NOT partitioned.
  //   - No FK to transactions table (not created yet).
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id              UUID              NOT NULL DEFAULT uuid_generate_v4(),
      journal_batch_id UUID             NOT NULL REFERENCES wallet_journal_batches(id) ON DELETE RESTRICT,
      wallet_id       UUID              NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
      entry_type      ledger_entry_type NOT NULL,
      amount          NUMERIC(18,2)     NOT NULL CHECK (amount > 0),    -- always positive
      signed_amount   NUMERIC(18,2)     NOT NULL,                       -- negative=debit, positive=credit
      currency        CHAR(3)           NOT NULL DEFAULT 'NGN',
      running_balance NUMERIC(18,2),     -- optional snapshot; authoritative value = SUM query
      description     TEXT              NOT NULL,

      -- Polymorphic reference (resolved at app layer, no FK constraint)
      reference_type  TEXT,              -- 'transaction' | 'topup' | 'fee' | 'reversal' | ...
      reference_id    UUID,              -- ID in the referenced table

      metadata        JSONB             NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

      -- Partition key (created_at) must be part of PK
      PRIMARY KEY (id, created_at),

      CONSTRAINT ledger_currency_fmt        CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ledger_signed_amount_valid CHECK (
        (entry_type = 'credit' AND signed_amount > 0) OR
        (entry_type = 'debit'  AND signed_amount < 0)
      ),
      CONSTRAINT ledger_amount_matches_signed CHECK (
        amount = ABS(signed_amount)
      )
    ) PARTITION BY RANGE (created_at)
  `);

  await knex.raw(`COMMENT ON TABLE wallet_ledger IS
    'Double-entry ledger. Each economic event produces >= 2 rows via wallet_journal_batches.
     Balance = SUM(signed_amount) grouped by wallet_id.
     Partitioned monthly by created_at. Use pg_partman for automated partition management.'
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS wallet_ledger_default PARTITION OF wallet_ledger DEFAULT
  `);

  // ── 5. Balance view ────────────────────────────────────────
  await knex.raw(`
    CREATE OR REPLACE VIEW v_wallet_balances AS
    SELECT
      w.id                               AS wallet_id,
      w.user_id,
      w.wallet_type,
      w.currency,
      w.status,
      COALESCE(SUM(l.signed_amount), 0)  AS balance,
      COUNT(l.id)                        AS ledger_entry_count,
      MAX(l.created_at)                  AS last_activity_at
    FROM wallets w
    LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
    GROUP BY w.id, w.user_id, w.wallet_type, w.currency, w.status
  `);

  await knex.raw(`COMMENT ON VIEW v_wallet_balances IS
    'Computes current wallet balance from wallet_ledger.
     For high-frequency reads, materialize this or maintain a cached balance
     in application layer (Redis), invalidated on every ledger insert.'
  `);

  // ── 6. Indexes ─────────────────────────────────────────────
  // wallets
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_wallets_user_id     ON wallets (user_id) WHERE user_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_wallets_type        ON wallets (wallet_type)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_wallets_status      ON wallets (status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_wallets_currency    ON wallets (currency)`);

  // wallet_journal_batches
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_journal_ref         ON wallet_journal_batches (reference_type, reference_id) WHERE reference_id IS NOT NULL`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_journal_status      ON wallet_journal_batches (status)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_journal_created_at  ON wallet_journal_batches (created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_journal_idempotency ON wallet_journal_batches (idempotency_key) WHERE idempotency_key IS NOT NULL`);

  // wallet_ledger (indexes on parent propagate to all partitions)
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ledger_wallet_id    ON wallet_ledger (wallet_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ledger_batch_id     ON wallet_ledger (journal_batch_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ledger_entry_type   ON wallet_ledger (entry_type, wallet_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_ledger_ref          ON wallet_ledger (reference_type, reference_id) WHERE reference_id IS NOT NULL`);
}

// ============================================================
// DOWN
// ============================================================
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP VIEW  IF EXISTS v_wallet_balances              CASCADE`);

  const triggers: Array<[string, string]> = [
    ["trg_wallets_updated_at",        "wallets"],
    ["trg_journal_batches_updated_at","wallet_journal_batches"],
  ];
  for (const [trg, tbl] of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trg} ON ${tbl}`);
  }

  await knex.raw(`DROP TABLE IF EXISTS wallet_ledger           CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS wallet_journal_batches  CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS wallets                 CASCADE`);

  const enums = ["journal_status", "ledger_entry_type", "wallet_status", "wallet_type"];
  for (const e of enums) {
    await knex.raw(`DROP TYPE IF EXISTS ${e} CASCADE`);
  }
}
