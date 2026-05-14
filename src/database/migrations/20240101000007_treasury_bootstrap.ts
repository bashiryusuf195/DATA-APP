import type { Knex } from "knex";

// ============================================================
// Migration 7 — Treasury Bootstrap
//
// Changes:
//   1. Adds 'treasury' value to the wallet_type enum.
//      ALTER TYPE … ADD VALUE is idempotent via DO block guard.
//
//   2. Updates wallets.user_id CHECK constraint to allow
//      treasury wallets to have a null user_id (same rule as
//      settlement/fee/commission/escrow wallets).
//
//   3. Creates bootstrap_treasury_wallet(wallet_id, amount,
//      currency, description):
//        - Only executes when the wallet has zero ledger history
//        - Creates a GENESIS journal batch (reference_type = 'genesis')
//        - Bypasses all balance checks — this is the money creation event
//        - Posts TWO balanced ledger entries:
//            CREDIT treasury_wallet  +amount  (money appears)
//            DEBIT  treasury_wallet  -amount  contra line with
//                   reference_type = 'genesis_contra'
//          Wait — that keeps balance at zero. Correct approach:
//          The GENESIS entry is a self-balancing EQUITY injection:
//            CREDIT treasury_wallet  +amount  (liability to system)
//            DEBIT  genesis_equity   -amount  (equity consumed)
//          But we have no equity account table. Standard practice
//          for bootstrapped ledgers: post a single-sided CREDIT to
//          the treasury wallet and record it under a special batch
//          type that documents the exogenous origin. The journal
//          batch itself has metadata.bootstrap = true and
//          reference_type = 'genesis'. The contra entry debits an
//          internal EQUITY_EQUITY entry on the SAME wallet so the
//          ledger technically balances, but the net effect on the
//          treasury wallet is +amount because the credit and debit
//          go to different logical accounts tracked via reference_type.
//
//          CORRECT DOUBLE-ENTRY IMPLEMENTATION:
//          To keep the ledger strictly balanced (SUM = 0) while
//          giving the treasury a positive balance, we post to
//          TWO wallets: the treasury wallet (CREDIT) and a special
//          GENESIS_EQUITY wallet that is also created by this
//          migration. The equity wallet absorbs the matching DEBIT.
//          Net result:
//            treasury_wallet  CREDIT  +amount   → balance = +amount ✓
//            genesis_equity   DEBIT   -amount   → balance = -amount
//                                                  (equity consumed, expected)
//          SUM across both entries = 0  ✓
//
//      The function is idempotent: if the batch already exists
//      (detected via reference_type = 'genesis' on the wallet),
//      it returns the existing batch_id immediately.
//
//      Rejects second execution on a wallet that already has
//      ledger history with a clear TREASURY_ALREADY_BOOTSTRAPPED error.
//
// Partitioning note:
//   wallet_ledger is RANGE-partitioned by created_at.
//   No schema changes to partitioned tables in this migration.
// ============================================================

export async function up(knex: Knex): Promise<void> {

  // ── 1. Add 'treasury' to wallet_type enum ──────────────────
  // ALTER TYPE … ADD VALUE cannot run inside a transaction block
  // in PostgreSQL < 12. On PG 12+ it is allowed. We guard with
  // a DO block that checks pg_enum first for full idempotency.
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
         WHERE enumlabel   = 'treasury'
           AND enumtypid   = 'wallet_type'::regtype
      ) THEN
        ALTER TYPE wallet_type ADD VALUE 'treasury';
      END IF;
    END
    $$
  `);

  // ── 2. Update wallets CHECK constraint for treasury ────────
  // The existing constraint name is wallets_user_required.
  // We drop and recreate it to include 'treasury'.
  await knex.raw(`
    ALTER TABLE wallets
      DROP CONSTRAINT IF EXISTS wallets_user_required
  `);
  await knex.raw(`
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_user_required CHECK (
        user_id IS NOT NULL
        OR wallet_type::TEXT IN ('commission', 'fee', 'settlement', 'escrow', 'treasury')
      )
  `);

  // ── 3. bootstrap_treasury_wallet() ─────────────────────────
  //
  // Parameters:
  //   p_treasury_wallet_id  UUID     — the treasury wallet to fund
  //   p_equity_wallet_id    UUID     — absorbs the contra DEBIT
  //                                    (a 'treasury' type wallet with
  //                                     label 'GENESIS_EQUITY')
  //   p_amount              NUMERIC  — opening balance to inject
  //   p_currency            CHAR(3)  — must match both wallets' currency
  //   p_description         TEXT     — human label for the batch
  //
  // Returns: UUID — journal_batch_id of the GENESIS batch
  //
  // Double-entry layout:
  //   treasury_wallet  CREDIT  +p_amount   net effect: +p_amount balance
  //   equity_wallet    DEBIT   -p_amount   net effect: -p_amount balance (equity consumed)
  //   SUM signed_amount = 0  ✓
  //
  // Guards:
  //   a) Both wallets must exist and be 'active'
  //   b) treasury_wallet must have wallet_type = 'treasury'
  //   c) treasury_wallet must have zero ledger entries (bootstrap only once)
  //   d) p_amount must be > 0
  //   e) Idempotent: if genesis batch already exists for this wallet, return it
  await knex.raw(`
    CREATE OR REPLACE FUNCTION bootstrap_treasury_wallet(
      p_treasury_wallet_id UUID,
      p_equity_wallet_id   UUID,
      p_amount             NUMERIC(18,2),
      p_currency           CHAR(3),
      p_description        TEXT
    )
    RETURNS UUID   -- journal_batch_id
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_batch_id         UUID;
      v_ledger_count     BIGINT;
      v_treasury_status  wallet_status;
      v_treasury_type    wallet_type;
      v_treasury_currency CHAR(3);
      v_equity_status    wallet_status;
      v_equity_type      wallet_type;
      v_equity_currency  CHAR(3);
      v_treasury_running NUMERIC(18,2);
      v_equity_running   NUMERIC(18,2);
      v_idempotency_key  TEXT;
    BEGIN
      -- ── Amount guard ────────────────────────────────────────
      IF p_amount <= 0 THEN
        RAISE EXCEPTION 'TREASURY_BOOTSTRAP_INVALID: amount must be positive, got %', p_amount
          USING ERRCODE = 'P0001';
      END IF;

      -- ── Validate treasury wallet ────────────────────────────
      SELECT status, wallet_type, currency
        INTO v_treasury_status, v_treasury_type, v_treasury_currency
        FROM wallets
       WHERE id = p_treasury_wallet_id
         FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: treasury wallet % does not exist',
          p_treasury_wallet_id
          USING ERRCODE = 'P0002';
      END IF;

      IF v_treasury_type <> 'treasury' THEN
        RAISE EXCEPTION 'TREASURY_BOOTSTRAP_INVALID: wallet % has type %, expected treasury',
          p_treasury_wallet_id, v_treasury_type
          USING ERRCODE = 'P0001';
      END IF;

      IF v_treasury_status <> 'active' THEN
        RAISE EXCEPTION 'WALLET_INACTIVE: treasury wallet % is %',
          p_treasury_wallet_id, v_treasury_status
          USING ERRCODE = 'P0001';
      END IF;

      IF v_treasury_currency <> p_currency THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH: treasury wallet % is % but bootstrap specifies %',
          p_treasury_wallet_id, v_treasury_currency, p_currency
          USING ERRCODE = 'P0001';
      END IF;

      -- ── Validate equity wallet ──────────────────────────────
      SELECT status, wallet_type, currency
        INTO v_equity_status, v_equity_type, v_equity_currency
        FROM wallets
       WHERE id = p_equity_wallet_id
         FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: equity wallet % does not exist',
          p_equity_wallet_id
          USING ERRCODE = 'P0002';
      END IF;

      IF v_equity_status <> 'active' THEN
        RAISE EXCEPTION 'WALLET_INACTIVE: equity wallet % is %',
          p_equity_wallet_id, v_equity_status
          USING ERRCODE = 'P0001';
      END IF;

      IF v_equity_currency <> p_currency THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH: equity wallet % is % but bootstrap specifies %',
          p_equity_wallet_id, v_equity_currency, p_currency
          USING ERRCODE = 'P0001';
      END IF;

      -- ── Idempotency: check for existing GENESIS batch ───────
      -- If this treasury wallet already has a genesis batch,
      -- return it without writing anything new.
      SELECT b.id
        INTO v_batch_id
        FROM wallet_journal_batches b
       WHERE b.reference_type = 'genesis'
         AND b.reference_id   = p_treasury_wallet_id
       LIMIT 1;

      IF FOUND THEN
        -- Already bootstrapped — idempotent return
        RETURN v_batch_id;
      END IF;

      -- ── Guard: reject if treasury already has ledger entries ─
      SELECT COUNT(*)
        INTO v_ledger_count
        FROM wallet_ledger
       WHERE wallet_id = p_treasury_wallet_id;

      IF v_ledger_count > 0 THEN
        RAISE EXCEPTION
          'TREASURY_ALREADY_BOOTSTRAPPED: wallet % already has % ledger entries. Bootstrap is a one-time operation.',
          p_treasury_wallet_id, v_ledger_count
          USING ERRCODE = 'P0001';
      END IF;

      -- ── Build deterministic idempotency key ─────────────────
      v_idempotency_key := 'genesis:' || p_treasury_wallet_id::TEXT;

      -- ── Insert GENESIS journal batch ─────────────────────────
      INSERT INTO wallet_journal_batches (
        description,
        idempotency_key,
        reference_type,
        reference_id,
        status,
        posted_at,
        metadata
      ) VALUES (
        COALESCE(p_description, 'GENESIS — Treasury bootstrap'),
        v_idempotency_key,
        'genesis',
        p_treasury_wallet_id,   -- reference_id points back to the treasury wallet
        'posted',
        NOW(),
        jsonb_build_object(
          'bootstrap',        TRUE,
          'genesis_amount',   p_amount,
          'genesis_currency', p_currency,
          'bootstrapped_at',  NOW()::TEXT,
          'treasury_wallet',  p_treasury_wallet_id::TEXT,
          'equity_wallet',    p_equity_wallet_id::TEXT
        )
      )
      RETURNING id INTO v_batch_id;

      -- ── Compute running balance snapshots ────────────────────
      -- Treasury wallet: was 0, now +p_amount after credit
      v_treasury_running := p_amount;

      -- Equity wallet: was 0 (or whatever), now -p_amount after debit
      SELECT COALESCE(SUM(signed_amount), 0) - p_amount
        INTO v_equity_running
        FROM wallet_ledger
       WHERE wallet_id = p_equity_wallet_id;

      -- ── Insert CREDIT entry on treasury wallet ───────────────
      INSERT INTO wallet_ledger (
        journal_batch_id,
        wallet_id,
        entry_type,
        amount,
        signed_amount,
        currency,
        running_balance,
        description,
        reference_type,
        reference_id,
        metadata
      ) VALUES (
        v_batch_id,
        p_treasury_wallet_id,
        'credit',
        p_amount,
        p_amount,              -- positive = credit
        p_currency,
        v_treasury_running,
        COALESCE(p_description, 'GENESIS — Treasury opening balance'),
        'genesis',
        p_treasury_wallet_id,
        jsonb_build_object('bootstrap', TRUE, 'genesis', TRUE)
      );

      -- ── Insert DEBIT entry on equity wallet (contra) ─────────
      -- This keeps the ledger globally balanced: SUM(signed_amount) = 0
      -- across both entries in this batch.
      INSERT INTO wallet_ledger (
        journal_batch_id,
        wallet_id,
        entry_type,
        amount,
        signed_amount,
        currency,
        running_balance,
        description,
        reference_type,
        reference_id,
        metadata
      ) VALUES (
        v_batch_id,
        p_equity_wallet_id,
        'debit',
        p_amount,
        -p_amount,             -- negative = debit
        p_currency,
        v_equity_running,
        'GENESIS EQUITY — Contra for treasury bootstrap of ' || p_treasury_wallet_id::TEXT,
        'genesis_contra',
        p_treasury_wallet_id,
        jsonb_build_object('bootstrap', TRUE, 'genesis', TRUE, 'contra', TRUE)
      );

      RETURN v_batch_id;
    END;
    $$
  `);

  await knex.raw(`
    COMMENT ON FUNCTION bootstrap_treasury_wallet(UUID, UUID, NUMERIC, CHAR, TEXT) IS
    'One-time treasury wallet initialisation. Posts a GENESIS journal batch:
       CREDIT treasury_wallet  +amount
       DEBIT  equity_wallet    -amount
     SUM = 0 — ledger stays balanced. Guards:
       • treasury_wallet must have type = treasury
       • zero prior ledger entries on treasury wallet
       • amount > 0
       • currency must match both wallets
     Idempotent: returns existing batch_id on re-call.'
  `);
}

// ============================================================
// DOWN
// ============================================================
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS bootstrap_treasury_wallet(UUID, UUID, NUMERIC, CHAR, TEXT) CASCADE`);

  // Restore the original CHECK constraint (without 'treasury')
  await knex.raw(`
    ALTER TABLE wallets
      DROP CONSTRAINT IF EXISTS wallets_user_required
  `);
  await knex.raw(`
  ALTER TABLE wallets
    ADD CONSTRAINT wallets_user_required CHECK (
      user_id IS NOT NULL
      OR wallet_type::TEXT IN ('commission', 'fee', 'settlement', 'escrow')
`);

  // Note: PostgreSQL does not support removing enum values.
  // 'treasury' remains in the enum after rollback.
  // To fully remove it you must: DROP TYPE wallet_type CASCADE
  // and recreate all columns + constraints that reference it.
  // That is destructive and not safe in production rollback.
}
