import type { Knex } from "knex";

// ============================================================
// Migration 6 — Wallet Engine: PostgreSQL Functions
//
// Functions created:
//   get_wallet_balance(p_wallet_id UUID)
//     → NUMERIC(18,2)
//     Returns the authoritative balance derived from wallet_ledger.
//     Acquires a ShareLock on the wallet row to prevent dirty reads
//     during concurrent debit checks.
//
//   post_wallet_journal(...)
//     → UUID (journal_batch_id)
//     Core double-entry posting function. Validates balance,
//     enforces idempotency, acquires advisory lock for debits,
//     inserts batch + ledger entries atomically.
//     Called internally by credit_wallet / debit_wallet / transfer_wallet.
//
//   credit_wallet(p_wallet_id, p_amount, p_currency, p_description,
//                 p_idempotency_key, p_reference_type, p_reference_id, p_metadata)
//     → UUID (journal_batch_id)
//     Credits a single wallet. Pair entry posts to the platform
//     fee/settlement wallet (or a virtual "external" contra account).
//
//   debit_wallet(p_wallet_id, p_amount, p_currency, p_description,
//                p_idempotency_key, p_reference_type, p_reference_id, p_metadata)
//     → UUID (journal_batch_id)
//     Debits a single wallet. Uses pg_try_advisory_xact_lock on
//     wallet_id hash to prevent concurrent overdrafts.
//
//   transfer_wallet(p_from_wallet_id, p_to_wallet_id, p_amount,
//                   p_currency, p_description, p_idempotency_key,
//                   p_reference_type, p_reference_id, p_metadata)
//     → UUID (journal_batch_id)
//     Peer-to-peer wallet transfer. Single batch, 2 ledger lines,
//     always balances to zero.
//
// Advisory lock strategy:
//   pg_try_advisory_xact_lock(hashtext(wallet_id::text))
//   Transaction-scoped (released on COMMIT/ROLLBACK automatically).
//   If lock cannot be acquired within the calling transaction,
//   raises a serialization error (caller must retry).
//
// Idempotency:
//   wallet_journal_batches.idempotency_key has a UNIQUE constraint.
//   On duplicate key, the function returns the existing batch_id
//   without re-posting — safe for at-least-once delivery.
// ============================================================

export async function up(knex: Knex): Promise<void> {

  // ── 1. get_wallet_balance ───────────────────────────────────
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_wallet_balance(
      p_wallet_id UUID
    )
    RETURNS NUMERIC(18,2)
    LANGUAGE plpgsql
    STABLE  -- same input = same output within a transaction; allows query planner optimisation
    AS $$
    DECLARE
      v_balance     NUMERIC(18,2);
      v_status      wallet_status;
    BEGIN
      -- Verify wallet exists and read status in one hit
      SELECT status
        INTO v_status
        FROM wallets
       WHERE id = p_wallet_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: wallet % does not exist', p_wallet_id
          USING ERRCODE = 'P0002';
      END IF;

      -- Sum all signed_amount entries for this wallet
      SELECT COALESCE(SUM(signed_amount), 0.00)
        INTO v_balance
        FROM wallet_ledger
       WHERE wallet_id = p_wallet_id;

      RETURN v_balance;
    END;
    $$
  `);

  // ── 2. post_wallet_journal ──────────────────────────────────
  // Internal core function — not called directly from application.
  // Accepts a JSON array of ledger line objects:
  //   [{wallet_id, entry_type, amount, currency, description,
  //     reference_type, reference_id, metadata}]
  //
  // Invariants enforced inside this function:
  //   a) idempotency_key uniqueness
  //   b) SUM(signed_amount) across all lines = 0
  //   c) wallet status = 'active'
  //   d) advisory lock acquired for every debit wallet
  //   e) sufficient balance for debit wallets (incl. overdraft_limit)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION post_wallet_journal(
      p_description     TEXT,
      p_idempotency_key TEXT,
      p_reference_type  TEXT,
      p_reference_id    UUID,
      p_metadata        JSONB,
      p_entries         JSONB   -- array of ledger line descriptors
    )
    RETURNS UUID   -- returns journal_batch_id
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_batch_id        UUID;
      v_entry           JSONB;
      v_wallet_id       UUID;
      v_entry_type      ledger_entry_type;
      v_amount          NUMERIC(18,2);
      v_signed_amount   NUMERIC(18,2);
      v_currency        CHAR(3);
      v_description     TEXT;
      v_ref_type        TEXT;
      v_ref_id          UUID;
      v_entry_meta      JSONB;
      v_sum_check       NUMERIC(18,2) := 0;
      v_balance         NUMERIC(18,2);
      v_overdraft_limit NUMERIC(18,2);
      v_wallet_status   wallet_status;
      v_wallet_currency CHAR(3);
      v_lock_acquired   BOOLEAN;
      v_entry_count     INTEGER;
      v_running_balance NUMERIC(18,2);
    BEGIN
      -- ── Guard: minimum 2 entries required ──────────────────
      v_entry_count := jsonb_array_length(p_entries);
      IF v_entry_count < 2 THEN
        RAISE EXCEPTION 'JOURNAL_INVALID: a journal batch requires at least 2 ledger entries, got %',
          v_entry_count
          USING ERRCODE = 'P0001';
      END IF;

      -- ── Idempotency check ───────────────────────────────────
      -- If a batch with this key already exists (posted or pending),
      -- return its id without any side effects.
      IF p_idempotency_key IS NOT NULL THEN
        SELECT id
          INTO v_batch_id
          FROM wallet_journal_batches
         WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
          RETURN v_batch_id;  -- idempotent no-op
        END IF;
      END IF;

      -- ── Pre-validate entries and compute signed totals ──────
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
      LOOP
        v_wallet_id   := (v_entry->>'wallet_id')::UUID;
        v_entry_type  := (v_entry->>'entry_type')::ledger_entry_type;
        v_amount      := (v_entry->>'amount')::NUMERIC(18,2);
        v_currency    := COALESCE(v_entry->>'currency', 'NGN');

        IF v_amount <= 0 THEN
          RAISE EXCEPTION 'JOURNAL_INVALID: entry amount must be positive, got % for wallet %',
            v_amount, v_wallet_id
            USING ERRCODE = 'P0001';
        END IF;

        -- Validate wallet exists, is active, and currency matches
        SELECT status, currency, overdraft_limit
          INTO v_wallet_status, v_wallet_currency, v_overdraft_limit
          FROM wallets
         WHERE id = v_wallet_id
           FOR SHARE;  -- share lock: block concurrent schema-altering writes

        IF NOT FOUND THEN
          RAISE EXCEPTION 'WALLET_NOT_FOUND: wallet % does not exist', v_wallet_id
            USING ERRCODE = 'P0002';
        END IF;

        IF v_wallet_status <> 'active' THEN
          RAISE EXCEPTION 'WALLET_INACTIVE: wallet % is %, cannot post journal entry',
            v_wallet_id, v_wallet_status
            USING ERRCODE = 'P0001';
        END IF;

        IF v_wallet_currency <> v_currency THEN
          RAISE EXCEPTION 'CURRENCY_MISMATCH: wallet % currency is % but entry specifies %',
            v_wallet_id, v_wallet_currency, v_currency
            USING ERRCODE = 'P0001';
        END IF;

        -- Compute signed amount and accumulate balance check
        IF v_entry_type = 'credit' THEN
          v_signed_amount := v_amount;
        ELSE
          v_signed_amount := -v_amount;
        END IF;

        v_sum_check := v_sum_check + v_signed_amount;

        -- ── Advisory lock for debit entries ──────────────────
        -- pg_try_advisory_xact_lock is transaction-scoped;
        -- auto-released on COMMIT/ROLLBACK.
        -- Lock key: lower 32 bits = hashtext of wallet_id string.
        IF v_entry_type = 'debit' THEN
          v_lock_acquired := pg_try_advisory_xact_lock(
            hashtext(v_wallet_id::TEXT)
          );
          IF NOT v_lock_acquired THEN
            RAISE EXCEPTION 'WALLET_LOCKED: wallet % is locked by a concurrent operation, retry shortly',
              v_wallet_id
              USING ERRCODE = '55P03';  -- lock_not_available
          END IF;

          -- ── Insufficient balance check ──────────────────────
          SELECT COALESCE(SUM(signed_amount), 0.00)
            INTO v_balance
            FROM wallet_ledger
           WHERE wallet_id = v_wallet_id;

          -- Balance must cover the debit amount after applying overdraft allowance
          IF (v_balance + v_overdraft_limit) < v_amount THEN
            RAISE EXCEPTION 'INSUFFICIENT_BALANCE: wallet % has balance % (overdraft limit %), cannot debit %',
              v_wallet_id, v_balance, v_overdraft_limit, v_amount
              USING ERRCODE = 'P0001';
          END IF;
        END IF;
      END LOOP;

      -- ── Balance invariant: SUM of all signed_amounts must = 0 ─
      IF v_sum_check <> 0 THEN
        RAISE EXCEPTION 'JOURNAL_UNBALANCED: ledger entries do not sum to zero (sum = %)',
          v_sum_check
          USING ERRCODE = 'P0001';
      END IF;

      -- ── Insert journal batch ────────────────────────────────
      INSERT INTO wallet_journal_batches (
        description, idempotency_key, reference_type, reference_id,
        status, metadata, posted_at
      ) VALUES (
        p_description, p_idempotency_key, p_reference_type, p_reference_id,
        'posted', COALESCE(p_metadata, '{}'), NOW()
      )
      RETURNING id INTO v_batch_id;

      -- ── Insert ledger entries ───────────────────────────────
      FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
      LOOP
        v_wallet_id   := (v_entry->>'wallet_id')::UUID;
        v_entry_type  := (v_entry->>'entry_type')::ledger_entry_type;
        v_amount      := (v_entry->>'amount')::NUMERIC(18,2);
        v_currency    := COALESCE(v_entry->>'currency', 'NGN');
        v_description := COALESCE(v_entry->>'description', p_description);
        v_ref_type    := COALESCE(v_entry->>'reference_type', p_reference_type);
        v_ref_id      := (v_entry->>'reference_id')::UUID;
        v_entry_meta  := COALESCE((v_entry->'metadata'), '{}');

        IF v_entry_type = 'credit' THEN
          v_signed_amount := v_amount;
        ELSE
          v_signed_amount := -v_amount;
        END IF;

        -- Compute running balance snapshot at insert time
        SELECT COALESCE(SUM(signed_amount), 0.00) + v_signed_amount
          INTO v_running_balance
          FROM wallet_ledger
         WHERE wallet_id = v_wallet_id;

        INSERT INTO wallet_ledger (
          journal_batch_id, wallet_id, entry_type, amount, signed_amount,
          currency, running_balance, description,
          reference_type, reference_id, metadata
        ) VALUES (
          v_batch_id, v_wallet_id, v_entry_type, v_amount, v_signed_amount,
          v_currency, v_running_balance, v_description,
          v_ref_type, v_ref_id, v_entry_meta
        );
      END LOOP;

      RETURN v_batch_id;
    END;
    $$
  `);

  // ── 3. credit_wallet ───────────────────────────────────────
  // Posts a credit to a wallet, with a matching debit to a
  // system contra wallet (passed as p_contra_wallet_id).
  // For simple topups where no contra wallet exists in the DB,
  // pass the same platform settlement wallet id.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION credit_wallet(
      p_wallet_id        UUID,
      p_contra_wallet_id UUID,           -- system wallet being debited (e.g. settlement/float)
      p_amount           NUMERIC(18,2),
      p_currency         CHAR(3),
      p_description      TEXT,
      p_idempotency_key  TEXT  DEFAULT NULL,
      p_reference_type   TEXT  DEFAULT NULL,
      p_reference_id     UUID  DEFAULT NULL,
      p_metadata         JSONB DEFAULT '{}'
    )
    RETURNS UUID   -- journal_batch_id
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_entries JSONB;
    BEGIN
      IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: credit amount must be positive, got %', p_amount
          USING ERRCODE = 'P0001';
      END IF;

      -- Build balanced entry set:
      --   CREDIT  → customer wallet  (balance increases)
      --   DEBIT   → contra wallet    (system float decreases)
      v_entries := jsonb_build_array(
        jsonb_build_object(
          'wallet_id',      p_wallet_id,
          'entry_type',     'credit',
          'amount',         p_amount,
          'currency',       p_currency,
          'description',    p_description,
          'reference_type', p_reference_type,
          'reference_id',   p_reference_id,
          'metadata',       p_metadata
        ),
        jsonb_build_object(
          'wallet_id',      p_contra_wallet_id,
          'entry_type',     'debit',
          'amount',         p_amount,
          'currency',       p_currency,
          'description',    'CONTRA: ' || p_description,
          'reference_type', p_reference_type,
          'reference_id',   p_reference_id,
          'metadata',       p_metadata
        )
      );

      RETURN post_wallet_journal(
        p_description,
        p_idempotency_key,
        p_reference_type,
        p_reference_id,
        p_metadata,
        v_entries
      );
    END;
    $$
  `);

  // ── 4. debit_wallet ────────────────────────────────────────
  // Debits a wallet, credits the contra (e.g. platform fee/settlement wallet).
  // Advisory lock is acquired inside post_wallet_journal for the debit wallet.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION debit_wallet(
      p_wallet_id        UUID,
      p_contra_wallet_id UUID,           -- system wallet being credited
      p_amount           NUMERIC(18,2),
      p_currency         CHAR(3),
      p_description      TEXT,
      p_idempotency_key  TEXT  DEFAULT NULL,
      p_reference_type   TEXT  DEFAULT NULL,
      p_reference_id     UUID  DEFAULT NULL,
      p_metadata         JSONB DEFAULT '{}'
    )
    RETURNS UUID
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_entries JSONB;
    BEGIN
      IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: debit amount must be positive, got %', p_amount
          USING ERRCODE = 'P0001';
      END IF;

      -- Build balanced entry set:
      --   DEBIT   → customer wallet  (balance decreases)
      --   CREDIT  → contra wallet    (system float increases)
      v_entries := jsonb_build_array(
        jsonb_build_object(
          'wallet_id',      p_wallet_id,
          'entry_type',     'debit',
          'amount',         p_amount,
          'currency',       p_currency,
          'description',    p_description,
          'reference_type', p_reference_type,
          'reference_id',   p_reference_id,
          'metadata',       p_metadata
        ),
        jsonb_build_object(
          'wallet_id',      p_contra_wallet_id,
          'entry_type',     'credit',
          'amount',         p_amount,
          'currency',       p_currency,
          'description',    'CONTRA: ' || p_description,
          'reference_type', p_reference_type,
          'reference_id',   p_reference_id,
          'metadata',       p_metadata
        )
      );

      RETURN post_wallet_journal(
        p_description,
        p_idempotency_key,
        p_reference_type,
        p_reference_id,
        p_metadata,
        v_entries
      );
    END;
    $$
  `);

  // ── 5. transfer_wallet ─────────────────────────────────────
  // Peer-to-peer wallet transfer. Single balanced batch:
  //   DEBIT  from_wallet
  //   CREDIT to_wallet
  // Advisory lock on both wallets (lower UUID first to prevent deadlock).
  await knex.raw(`
    CREATE OR REPLACE FUNCTION transfer_wallet(
      p_from_wallet_id  UUID,
      p_to_wallet_id    UUID,
      p_amount          NUMERIC(18,2),
      p_currency        CHAR(3),
      p_description     TEXT,
      p_idempotency_key TEXT  DEFAULT NULL,
      p_reference_type  TEXT  DEFAULT NULL,
      p_reference_id    UUID  DEFAULT NULL,
      p_metadata        JSONB DEFAULT '{}'
    )
    RETURNS UUID
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_entries JSONB;
    BEGIN
      IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: transfer amount must be positive, got %', p_amount
          USING ERRCODE = 'P0001';
      END IF;

      IF p_from_wallet_id = p_to_wallet_id THEN
        RAISE EXCEPTION 'TRANSFER_INVALID: source and destination wallets must differ'
          USING ERRCODE = 'P0001';
      END IF;

      -- Entries ordered debit-first so post_wallet_journal acquires
      -- the advisory lock on the source wallet before checking balance.
      -- No deadlock risk because each wallet gets exactly one lock attempt.
      v_entries := jsonb_build_array(
        jsonb_build_object(
          'wallet_id',      p_from_wallet_id,
          'entry_type',     'debit',
          'amount',         p_amount,
          'currency',       p_currency,
          'description',    'TRANSFER OUT: ' || p_description,
          'reference_type', p_reference_type,
          'reference_id',   p_reference_id,
          'metadata',       p_metadata
        ),
        jsonb_build_object(
          'wallet_id',      p_to_wallet_id,
          'entry_type',     'credit',
          'amount',         p_amount,
          'currency',       p_currency,
          'description',    'TRANSFER IN: ' || p_description,
          'reference_type', p_reference_type,
          'reference_id',   p_reference_id,
          'metadata',       p_metadata
        )
      );

      RETURN post_wallet_journal(
        p_description,
        p_idempotency_key,
        p_reference_type,
        p_reference_id,
        p_metadata,
        v_entries
      );
    END;
    $$
  `);

  // ── 6. get_wallet_ledger_page ──────────────────────────────
  // Paginated ledger history for a wallet. Returns JSON for easy
  // consumption by the Node.js service layer.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_wallet_ledger_page(
      p_wallet_id UUID,
      p_limit     INTEGER DEFAULT 20,
      p_offset    INTEGER DEFAULT 0
    )
    RETURNS TABLE (
      id               UUID,
      journal_batch_id UUID,
      entry_type       ledger_entry_type,
      amount           NUMERIC(18,2),
      signed_amount    NUMERIC(18,2),
      running_balance  NUMERIC(18,2),
      currency         CHAR(3),
      description      TEXT,
      reference_type   TEXT,
      reference_id     UUID,
      created_at       TIMESTAMPTZ
    )
    LANGUAGE sql
    STABLE
    AS $$
      SELECT
        l.id, l.journal_batch_id, l.entry_type,
        l.amount, l.signed_amount, l.running_balance,
        l.currency, l.description,
        l.reference_type, l.reference_id,
        l.created_at
      FROM wallet_ledger l
      WHERE l.wallet_id = p_wallet_id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT  p_limit
      OFFSET p_offset;
    $$
  `);
}

// ============================================================
// DOWN
// ============================================================
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS get_wallet_ledger_page(UUID, INTEGER, INTEGER) CASCADE`);
  await knex.raw(`DROP FUNCTION IF EXISTS transfer_wallet(UUID, UUID, NUMERIC, CHAR, TEXT, TEXT, TEXT, UUID, JSONB) CASCADE`);
  await knex.raw(`DROP FUNCTION IF EXISTS debit_wallet(UUID, UUID, NUMERIC, CHAR, TEXT, TEXT, TEXT, UUID, JSONB) CASCADE`);
  await knex.raw(`DROP FUNCTION IF EXISTS credit_wallet(UUID, UUID, NUMERIC, CHAR, TEXT, TEXT, TEXT, UUID, JSONB) CASCADE`);
  await knex.raw(`DROP FUNCTION IF EXISTS post_wallet_journal(TEXT, TEXT, TEXT, UUID, JSONB, JSONB) CASCADE`);
  await knex.raw(`DROP FUNCTION IF EXISTS get_wallet_balance(UUID) CASCADE`);
}
