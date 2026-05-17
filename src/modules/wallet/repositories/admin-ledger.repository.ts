// src/modules/wallet/repositories/admin-ledger.repository.ts
// Read-only data access for GET /admin/wallet-ledger and GET /admin/journal-batches.

import { getDbInstance } from "../../../db/knex";

// ── Options ────────────────────────────────────────────────────────────────────

export interface AdminLedgerOptions {
  limit:           number;
  offset:          number;
  wallet_id?:      string;
  user_id?:        string;
  entry_type?:     "debit" | "credit";
  reference_id?:   string;
  reference_type?: string;
  from?:           string;
  to?:             string;
}

export interface AdminJournalBatchOptions {
  limit:   number;
  offset:  number;
  status?: "pending" | "posted" | "reversed" | "failed";
  from?:   string;
  to?:     string;
}

// ── Row types ──────────────────────────────────────────────────────────────────

export interface AdminLedgerRow {
  id:               string;
  wallet_id:        string;
  user_id:          string | null;
  journal_batch_id: string;
  entry_type:       "debit" | "credit";
  amount:           string; // pg numeric → string; service casts
  signed_amount:    string;
  currency:         string;
  running_balance:  string | null;
  description:      string;
  reference_type:   string | null;
  reference_id:     string | null;
  created_at:       string;
}

export interface AdminJournalBatchRow {
  id:              string;
  status:          string;
  description:     string;
  reference_type:  string | null;
  reference_id:    string | null;
  idempotency_key: string | null;
  total_credit:    string;  // pg numeric aggregate
  total_debit:     string;
  entry_count:     string;  // pg bigint
  balanced:        boolean;
  created_at:      string;
}

export interface AdminJournalBatchDetailBatch {
  id:              string;
  status:          string;
  description:     string;
  reference_type:  string | null;
  reference_id:    string | null;
  idempotency_key: string | null;
  posted_at:       string | null;
  reversed_at:     string | null;
  metadata:        Record<string, unknown>;
  created_at:      string;
  updated_at:      string;
}

export interface AdminJournalBatchSummaryRow {
  total_credit: string;
  total_debit:  string;
  net:          string;
  entry_count:  string;
  balanced:     boolean;
}

export interface LinkedTransactionRow {
  id:        string;
  reference: string;
  type:      string;
  status:    string;
  amount:    string;
  currency:  string;
}

// ── Filter builders ────────────────────────────────────────────────────────────

function applyLedgerFilters(
  query: ReturnType<ReturnType<typeof getDbInstance>>,
  opts: AdminLedgerOptions,
): void {
  if (opts.wallet_id)      query.where("l.wallet_id", opts.wallet_id);
  if (opts.user_id)        query.where("w.user_id", opts.user_id);
  if (opts.entry_type)     query.where("l.entry_type", opts.entry_type);
  if (opts.reference_id)   query.where("l.reference_id", opts.reference_id);
  if (opts.reference_type) query.where("l.reference_type", opts.reference_type);
  if (opts.from)           query.where("l.created_at", ">=", opts.from);
  if (opts.to)             query.where("l.created_at", "<=", opts.to);
}

function applyBatchFilters(
  query: ReturnType<ReturnType<typeof getDbInstance>>,
  opts: AdminJournalBatchOptions,
): void {
  if (opts.status) query.where("b.status", opts.status);
  if (opts.from)   query.where("b.created_at", ">=", opts.from);
  if (opts.to)     query.where("b.created_at", "<=", opts.to);
}

// ── Ledger count ───────────────────────────────────────────────────────────────

export async function countAdminLedgerEntries(
  opts: AdminLedgerOptions,
): Promise<number> {
  const db = getDbInstance();
  const query = db("wallet_ledger as l").join(
    "wallets as w",
    "w.id",
    "l.wallet_id",
  );
  applyLedgerFilters(query, opts);
  const result = await query
    .count("l.id as count")
    .first<{ count: string }>();
  return Number(result?.count ?? 0);
}

// ── Ledger page ────────────────────────────────────────────────────────────────

export async function fetchAdminLedgerEntries(
  opts: AdminLedgerOptions,
): Promise<AdminLedgerRow[]> {
  const db = getDbInstance();
  const query = db("wallet_ledger as l").join(
    "wallets as w",
    "w.id",
    "l.wallet_id",
  );
  applyLedgerFilters(query, opts);

  return query
    .select([
      "l.id",
      "l.wallet_id",
      "w.user_id",
      "l.journal_batch_id",
      "l.entry_type",
      "l.amount",
      "l.signed_amount",
      "l.currency",
      "l.running_balance",
      "l.description",
      "l.reference_type",
      "l.reference_id",
      "l.created_at",
    ])
    .orderBy("l.created_at", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
}

// ── Journal batch count ────────────────────────────────────────────────────────

export async function countAdminJournalBatches(
  opts: AdminJournalBatchOptions,
): Promise<number> {
  const db = getDbInstance();
  const query = db("wallet_journal_batches as b");
  applyBatchFilters(query, opts);
  const result = await query
    .count("b.id as count")
    .first<{ count: string }>();
  return Number(result?.count ?? 0);
}

// ── Journal batch page ─────────────────────────────────────────────────────────
// Aggregation uses LEFT JOIN so batches with no entries still appear (balanced = true).
// PostgreSQL allows GROUP BY primary key, making all other batch columns accessible.

export async function fetchAdminJournalBatches(
  opts: AdminJournalBatchOptions,
): Promise<AdminJournalBatchRow[]> {
  const db = getDbInstance();
  const query = db("wallet_journal_batches as b").leftJoin(
    "wallet_ledger as l",
    "l.journal_batch_id",
    "b.id",
  );
  applyBatchFilters(query, opts);

  return query
    .select([
      "b.id",
      "b.status",
      "b.description",
      "b.reference_type",
      "b.reference_id",
      "b.idempotency_key",
      "b.created_at",
      db.raw(
        `COALESCE(SUM(CASE WHEN l.entry_type = 'credit' THEN l.amount ELSE 0 END), 0) AS total_credit`,
      ),
      db.raw(
        `COALESCE(SUM(CASE WHEN l.entry_type = 'debit'  THEN l.amount ELSE 0 END), 0) AS total_debit`,
      ),
      db.raw(`COUNT(l.id) AS entry_count`),
      db.raw(`(COALESCE(SUM(l.signed_amount), 0) = 0) AS balanced`),
    ])
    .groupBy("b.id")
    .orderBy("b.created_at", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
}

// ── Journal batch detail ───────────────────────────────────────────────────────

export async function fetchAdminJournalBatchById(id: string): Promise<{
  batch:             AdminJournalBatchDetailBatch;
  summary:           AdminJournalBatchSummaryRow;
  entries:           AdminLedgerRow[];
  linkedTransaction: LinkedTransactionRow | null;
} | null> {
  const db = getDbInstance();

  const batch = await db("wallet_journal_batches")
    .where("id", id)
    .select([
      "id",
      "status",
      "description",
      "reference_type",
      "reference_id",
      "idempotency_key",
      "posted_at",
      "reversed_at",
      "metadata",
      "created_at",
      "updated_at",
    ])
    .first<AdminJournalBatchDetailBatch>();

  if (!batch) return null;

  // Fetch entries and summary concurrently
  const [entries, summary] = await Promise.all([
    db("wallet_ledger as l")
      .join("wallets as w", "w.id", "l.wallet_id")
      .where("l.journal_batch_id", id)
      .select([
        "l.id",
        "l.wallet_id",
        "w.user_id",
        "l.journal_batch_id",
        "l.entry_type",
        "l.amount",
        "l.signed_amount",
        "l.currency",
        "l.running_balance",
        "l.description",
        "l.reference_type",
        "l.reference_id",
        "l.created_at",
      ])
      .orderBy([
        { column: "l.entry_type", order: "desc" }, // credits first
        { column: "l.amount",     order: "desc" },
      ]) as Promise<AdminLedgerRow[]>,

    db("wallet_ledger")
      .where("journal_batch_id", id)
      .select([
        db.raw(
          `COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) AS total_credit`,
        ),
        db.raw(
          `COALESCE(SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END), 0) AS total_debit`,
        ),
        db.raw(`COALESCE(SUM(signed_amount), 0) AS net`),
        db.raw(`COUNT(*) AS entry_count`),
        db.raw(`(COALESCE(SUM(signed_amount), 0) = 0) AS balanced`),
      ])
      .first<AdminJournalBatchSummaryRow>(),
  ]);

  // Linked transaction — only resolved when reference_type = 'transaction'
  let linkedTransaction: LinkedTransactionRow | null = null;
  if (batch.reference_type === "transaction" && batch.reference_id) {
    const row = await db("transactions")
      .where("id", batch.reference_id)
      .select(["id", "reference", "type", "status", "amount", "currency"])
      .first<LinkedTransactionRow>();
    linkedTransaction = row ?? null;
  }

  return {
    batch,
    summary: summary ?? {
      total_credit: "0",
      total_debit:  "0",
      net:          "0",
      entry_count:  "0",
      balanced:     true,
    },
    entries,
    linkedTransaction,
  };
}
