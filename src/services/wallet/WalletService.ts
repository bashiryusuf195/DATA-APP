// ============================================================
// src/wallet/WalletService.ts
//
// Node.js service layer over the PostgreSQL wallet engine.
//
// All balance-mutating operations call PostgreSQL functions
// via knex.raw so that advisory locking, idempotency, and
// double-entry enforcement happen inside a single database
// transaction with no round-trips that could leave partial state.
//
// Usage:
//   const wallet = new WalletService(knex);
//   const { journal_batch_id } = await wallet.credit({ ... });
// ============================================================

import type { Knex } from "knex";
import { fromPostgresError, WalletError } from "./WalletError";
import type {
  Wallet,
  WalletBalance,
  JournalBatch,
  LedgerEntry,
  CreateWalletInput,
  CreditWalletInput,
  DebitWalletInput,
  TransferWalletInput,
  GetLedgerPageInput,
  JournalResult,
  BootstrapTreasuryInput,
  BootstrapTreasuryResult,
} from "./types.js";

export class WalletService {
  constructor(private readonly db: Knex) {}

  // ── Wallet management ────────────────────────────────────────

  /**
   * Create a new wallet row. Returns the created wallet.
   * Does NOT create any ledger entries — balance starts at 0 by definition.
   */
  async createWallet(input: CreateWalletInput): Promise<Wallet> {
    const [wallet] = await this.db("wallets")
      .insert({
        user_id:             input.user_id ?? null,
        wallet_type:         input.wallet_type ?? "user",
        currency:            (input.currency ?? "NGN").toUpperCase(),
        is_default:          input.is_default ?? false,
        label:               input.label ?? null,
        daily_debit_limit:   input.daily_debit_limit ?? 0,
        monthly_debit_limit: input.monthly_debit_limit ?? 0,
        single_txn_limit:    input.single_txn_limit ?? 0,
        overdraft_limit:     input.overdraft_limit ?? 0,
        metadata:            JSON.stringify(input.metadata ?? {}),
      })
      .returning("*");

    return this.coerceWallet(wallet);
  }

  /**
   * Fetch a wallet by id. Throws WalletNotFoundError if absent.
   */
  async getWallet(walletId: string): Promise<Wallet> {
    const row = await this.db("wallets").where({ id: walletId }).first();
    if (!row) {
      throw fromPostgresError(
        new Error(`WALLET_NOT_FOUND: wallet ${walletId} does not exist`)
      );
    }
    return this.coerceWallet(row);
  }

  /**
   * List all wallets belonging to a user.
   */
  async getUserWallets(userId: string): Promise<Wallet[]> {
    const rows = await this.db("wallets")
      .where({ user_id: userId })
      .orderBy("is_default", "desc")
      .orderBy("created_at", "asc");
    return rows.map(this.coerceWallet);
  }

  // ── Balance ───────────────────────────────────────────────────

  /**
   * Returns the authoritative balance for a wallet by calling
   * the PostgreSQL get_wallet_balance() function.
   * This is the ONLY source of truth — never read from wallets table.
   */
  async getBalance(walletId: string): Promise<number> {
    try {
      const result = await this.db.raw<{ rows: Array<{ get_wallet_balance: string }> }>(
        `SELECT get_wallet_balance(?::UUID) AS get_wallet_balance`,
        [walletId]
      );
      return parseFloat(result.rows[0].get_wallet_balance);
    } catch (err) {
      throw fromPostgresError(err);
    }
  }

  /**
   * Returns balance plus wallet metadata from the v_wallet_balances view.
   */
  async getWalletBalance(walletId: string): Promise<WalletBalance> {
    const row = await this.db("v_wallet_balances").where({ wallet_id: walletId }).first();
    if (!row) {
      throw fromPostgresError(
        new Error(`WALLET_NOT_FOUND: wallet ${walletId} does not exist`)
      );
    }
    return {
      wallet_id:           row.wallet_id,
      user_id:             row.user_id,
      wallet_type:         row.wallet_type,
      currency:            row.currency,
      status:              row.status,
      balance:             parseFloat(row.balance),
      ledger_entry_count:  parseInt(row.ledger_entry_count, 10),
      last_activity_at:    row.last_activity_at ? new Date(row.last_activity_at) : null,
    };
  }

  // ── Mutating operations ───────────────────────────────────────

  /**
   * Credit a wallet. Posts a balanced 2-line journal:
   *   CREDIT customer_wallet  (+amount)
   *   DEBIT  contra_wallet    (-amount)
   *
   * The contra_wallet_id is typically a platform settlement or
   * float wallet that represents the inflow source.
   *
   * Idempotent: if idempotency_key already exists, returns
   * the existing batch_id with idempotent=true.
   */
  async credit(input: CreditWalletInput): Promise<JournalResult> {
    return this.callJournalFn(
      `SELECT credit_wallet(
        ?::UUID, ?::UUID,
        ?::NUMERIC,
        ?::CHAR(3),
        ?::TEXT,
        ?::TEXT,
        ?::TEXT,
        ?::UUID,
        ?::JSONB
      ) AS journal_batch_id`,
      [
        input.wallet_id,
        input.contra_wallet_id,
        input.amount,
        (input.currency ?? "NGN").toUpperCase(),
        input.description,
        input.idempotency_key ?? null,
        input.reference_type ?? null,
        input.reference_id ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
      input.idempotency_key
    );
  }

  /**
   * Debit a wallet. Posts a balanced 2-line journal:
   *   DEBIT  customer_wallet  (-amount)
   *   CREDIT contra_wallet    (+amount)
   *
   * Acquires a PostgreSQL advisory lock inside the DB function
   * to prevent concurrent overdrafts. Throws InsufficientBalanceError
   * if balance (+ overdraft_limit) < amount.
   */
  async debit(input: DebitWalletInput): Promise<JournalResult> {
    return this.callJournalFn(
      `SELECT debit_wallet(
        ?::UUID, ?::UUID,
        ?::NUMERIC,
        ?::CHAR(3),
        ?::TEXT,
        ?::TEXT,
        ?::TEXT,
        ?::UUID,
        ?::JSONB
      ) AS journal_batch_id`,
      [
        input.wallet_id,
        input.contra_wallet_id,
        input.amount,
        (input.currency ?? "NGN").toUpperCase(),
        input.description,
        input.idempotency_key ?? null,
        input.reference_type ?? null,
        input.reference_id ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
      input.idempotency_key
    );
  }

  /**
   * Transfer between two wallets (peer-to-peer). Single batch:
   *   DEBIT  from_wallet  (-amount)
   *   CREDIT to_wallet    (+amount)
   *
   * Acquires advisory lock on from_wallet before balance check.
   * Both wallets must use the same currency.
   */
  async transfer(input: TransferWalletInput): Promise<JournalResult> {
    return this.callJournalFn(
      `SELECT transfer_wallet(
        ?::UUID, ?::UUID,
        ?::NUMERIC,
        ?::CHAR(3),
        ?::TEXT,
        ?::TEXT,
        ?::TEXT,
        ?::UUID,
        ?::JSONB
      ) AS journal_batch_id`,
      [
        input.from_wallet_id,
        input.to_wallet_id,
        input.amount,
        (input.currency ?? "NGN").toUpperCase(),
        input.description,
        input.idempotency_key ?? null,
        input.reference_type ?? null,
        input.reference_id ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
      input.idempotency_key
    );
  }

  // ── Treasury bootstrap ────────────────────────────────────────

  /**
   * One-time initialisation for a treasury wallet.
   * Calls the PostgreSQL bootstrap_treasury_wallet() function which:
   *   - Guards against re-bootstrapping (wallet must have zero ledger history)
   *   - Posts a GENESIS journal batch bypassing balance checks
   *   - Inserts two balanced ledger entries:
   *       CREDIT treasury_wallet  +amount
   *       DEBIT  equity_wallet    -amount
   *   - Records metadata.bootstrap = true on the batch
   * Idempotent: re-calling returns the existing batch_id with idempotent=true.
   */
  async bootstrapTreasury(
    input: BootstrapTreasuryInput
  ): Promise<BootstrapTreasuryResult> {
    // Check whether genesis batch already exists BEFORE calling the function
    const existing = await this.db("wallet_journal_batches")
      .where({
        reference_type: "genesis",
        reference_id:   input.treasury_wallet_id,
      })
      .first("id");

    const alreadyExisted = Boolean(existing);

    let journal_batch_id: string;

    try {
      await this.db.transaction(async (trx) => {
        const result = await trx.raw<{
          rows: Array<{ bootstrap_treasury_wallet: string }>;
        }>(
          `SELECT bootstrap_treasury_wallet(
            ?::UUID,
            ?::UUID,
            ?::NUMERIC,
            ?::CHAR(3),
            ?::TEXT
          ) AS bootstrap_treasury_wallet`,
          [
            input.treasury_wallet_id,
            input.equity_wallet_id,
            input.amount,
            (input.currency ?? "NGN").toUpperCase(),
            input.description ?? "GENESIS — Treasury opening balance",
          ]
        );
        journal_batch_id = result.rows[0].bootstrap_treasury_wallet;
      });
    } catch (err) {
      throw fromPostgresError(err);
    }

    return {
      journal_batch_id: journal_batch_id!,
      idempotent: alreadyExisted,
    };
  }

  // ── Ledger history ────────────────────────────────────────────

  /**
   * Returns a page of ledger entries for a wallet, newest first.
   */
  async getLedgerPage(input: GetLedgerPageInput): Promise<LedgerEntry[]> {
    try {
      const result = await this.db.raw<{ rows: LedgerEntry[] }>(
        `SELECT * FROM get_wallet_ledger_page(?::UUID, ?::INTEGER, ?::INTEGER)`,
        [input.wallet_id, input.limit ?? 20, input.offset ?? 0]
      );
      return (result.rows as unknown as Record<string, unknown>[]).map(this.coerceLedgerEntry);
    } catch (err) {
      throw fromPostgresError(err);
    }
  }

  /**
   * Fetch a single journal batch with all its ledger entries.
   */
  async getJournalBatch(
    batchId: string
  ): Promise<{ batch: JournalBatch; entries: LedgerEntry[] }> {
    const batch = await this.db("wallet_journal_batches")
      .where({ id: batchId })
      .first();

    if (!batch) {
      throw new WalletError("INTERNAL_ERROR", `Journal batch ${batchId} not found`);
    }

    const entries = await this.db("wallet_ledger")
      .where({ journal_batch_id: batchId })
      .orderBy("created_at", "asc");

    return {
      batch: this.coerceJournalBatch(batch),
      entries: entries.map(this.coerceLedgerEntry),
    };
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Executes a SQL function call that returns a journal_batch_id.
   * Detects idempotent replays by checking whether the returned
   * batch already existed before this call.
   *
   * All calls run inside a single DB transaction so advisory locks
   * acquired inside the PL/pgSQL function are released on commit.
   */
  private async callJournalFn(
    sql: string,
    bindings: unknown[],
    idempotencyKey: string | undefined
  ): Promise<JournalResult> {
    // Track whether the batch existed before calling the function
    let existedBefore = false;

    if (idempotencyKey) {
      const existing = await this.db("wallet_journal_batches")
        .where({ idempotency_key: idempotencyKey })
        .first("id");
      existedBefore = Boolean(existing);
    }

    let journal_batch_id: string;

    try {
      // Wrap in a transaction so advisory lock is scoped correctly
      await this.db.transaction(async (trx) => {
        const result = await trx.raw<{ rows: Array<{ journal_batch_id: string }> }>(
          sql,
          bindings as any[]
        );
        journal_batch_id = result.rows[0].journal_batch_id;
      });
    } catch (err) {
      throw fromPostgresError(err);
    }

    return {
      journal_batch_id: journal_batch_id!,
      idempotent: existedBefore,
    };
  }

  // Type coercions — knex returns all numeric columns as strings from pg driver

  private coerceWallet(row: Record<string, unknown>): Wallet {
    return {
      id:                  row.id as string,
      user_id:             (row.user_id as string | null) ?? null,
      wallet_type:         row.wallet_type as Wallet["wallet_type"],
      currency:            row.currency as string,
      status:              row.status as Wallet["status"],
      daily_debit_limit:   parseFloat(row.daily_debit_limit as string),
      monthly_debit_limit: parseFloat(row.monthly_debit_limit as string),
      single_txn_limit:    parseFloat(row.single_txn_limit as string),
      overdraft_limit:     parseFloat(row.overdraft_limit as string),
      is_default:          row.is_default as boolean,
      label:               (row.label as string | null) ?? null,
      metadata:            (row.metadata as Record<string, unknown>) ?? {},
      created_at:          new Date(row.created_at as string),
      updated_at:          new Date(row.updated_at as string),
    };
  }

  private coerceLedgerEntry(row: Record<string, unknown>): LedgerEntry {
    return {
      id:               row.id as string,
      journal_batch_id: row.journal_batch_id as string,
      wallet_id:        row.wallet_id as string,
      entry_type:       row.entry_type as LedgerEntry["entry_type"],
      amount:           parseFloat(row.amount as string),
      signed_amount:    parseFloat(row.signed_amount as string),
      currency:         row.currency as string,
      running_balance:  row.running_balance != null
                          ? parseFloat(row.running_balance as string)
                          : null,
      description:      row.description as string,
      reference_type:   (row.reference_type as string | null) ?? null,
      reference_id:     (row.reference_id as string | null) ?? null,
      metadata:         (row.metadata as Record<string, unknown>) ?? {},
      created_at:       new Date(row.created_at as string),
    };
  }

  private coerceJournalBatch(row: Record<string, unknown>): JournalBatch {
    return {
      id:                row.id as string,
      status:            row.status as JournalBatch["status"],
      description:       row.description as string,
      reference_type:    (row.reference_type as string | null) ?? null,
      reference_id:      (row.reference_id as string | null) ?? null,
      idempotency_key:   (row.idempotency_key as string | null) ?? null,
      posted_at:         row.posted_at ? new Date(row.posted_at as string) : null,
      reversed_at:       row.reversed_at ? new Date(row.reversed_at as string) : null,
      reversed_by:       (row.reversed_by as string | null) ?? null,
      reversal_batch_id: (row.reversal_batch_id as string | null) ?? null,
      metadata:          (row.metadata as Record<string, unknown>) ?? {},
      created_at:        new Date(row.created_at as string),
      updated_at:        new Date(row.updated_at as string),
    };
  }
}
