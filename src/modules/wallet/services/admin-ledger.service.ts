// src/modules/wallet/services/admin-ledger.service.ts
// Business logic for admin wallet ledger and journal batch endpoints.

import { NotFoundError } from "../../../lib/errors";
import {
  type AdminLedgerOptions,
  type AdminJournalBatchOptions,
  type AdminLedgerRow,
  countAdminLedgerEntries,
  fetchAdminLedgerEntries,
  countAdminJournalBatches,
  fetchAdminJournalBatches,
  fetchAdminJournalBatchById,
} from "../repositories/admin-ledger.repository";

// ── Response shapes ───────────────────────────────────────────────────────────

export interface AdminLedgerEntry {
  id:               string;
  wallet_id:        string;
  user_id:          string | null;
  journal_batch_id: string;
  entry_type:       "debit" | "credit";
  amount:           number;
  signed_amount:    number;
  currency:         string;
  running_balance:  number | null;
  description:      string;
  reference_type:   string | null;
  reference_id:     string | null;
  created_at:       string;
}

export interface AdminLedgerResult {
  entries: AdminLedgerEntry[];
  total:   number;
}

export interface AdminJournalBatchSummary {
  id:              string;
  status:          string;
  description:     string;
  reference_type:  string | null;
  reference_id:    string | null;
  idempotency_key: string | null;
  total_credit:    number;
  total_debit:     number;
  entry_count:     number;
  balanced:        boolean;
  created_at:      string;
}

export interface AdminJournalBatchListResult {
  batches: AdminJournalBatchSummary[];
  total:   number;
}

export interface AdminJournalBatchDetail {
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
  summary: {
    total_credit: number;
    total_debit:  number;
    net:          number;
    entry_count:  number;
    balanced:     boolean;
  };
  entries: AdminLedgerEntry[];
  linked_transaction: {
    id:        string;
    reference: string;
    type:      string;
    status:    string;
    amount:    number;
    currency:  string;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function castEntry(row: AdminLedgerRow): AdminLedgerEntry {
  return {
    id:               row.id,
    wallet_id:        row.wallet_id,
    user_id:          row.user_id ?? null,
    journal_batch_id: row.journal_batch_id,
    entry_type:       row.entry_type,
    amount:           Number(row.amount),
    signed_amount:    Number(row.signed_amount),
    currency:         row.currency,
    running_balance:  row.running_balance != null ? Number(row.running_balance) : null,
    description:      row.description,
    reference_type:   row.reference_type ?? null,
    reference_id:     row.reference_id   ?? null,
    created_at:       row.created_at,
  };
}

// ── List ledger entries ────────────────────────────────────────────────────────

export async function listAdminLedgerEntries(
  opts: AdminLedgerOptions,
): Promise<AdminLedgerResult> {
  const [total, rows] = await Promise.all([
    countAdminLedgerEntries(opts),
    fetchAdminLedgerEntries(opts),
  ]);

  return { entries: rows.map(castEntry), total };
}

// ── List journal batches ───────────────────────────────────────────────────────

export async function listAdminJournalBatches(
  opts: AdminJournalBatchOptions,
): Promise<AdminJournalBatchListResult> {
  const [total, rows] = await Promise.all([
    countAdminJournalBatches(opts),
    fetchAdminJournalBatches(opts),
  ]);

  const batches: AdminJournalBatchSummary[] = rows.map((r) => ({
    id:              r.id,
    status:          r.status,
    description:     r.description,
    reference_type:  r.reference_type  ?? null,
    reference_id:    r.reference_id    ?? null,
    idempotency_key: r.idempotency_key ?? null,
    total_credit:    Number(r.total_credit),
    total_debit:     Number(r.total_debit),
    entry_count:     Number(r.entry_count),
    balanced:        Boolean(r.balanced),
    created_at:      r.created_at,
  }));

  return { batches, total };
}

// ── Journal batch detail ───────────────────────────────────────────────────────

export async function getAdminJournalBatch(
  id: string,
): Promise<AdminJournalBatchDetail> {
  const result = await fetchAdminJournalBatchById(id);
  if (!result) throw new NotFoundError("Journal batch");

  const { batch, summary, entries, linkedTransaction } = result;

  return {
    id:              batch.id,
    status:          batch.status,
    description:     batch.description,
    reference_type:  batch.reference_type  ?? null,
    reference_id:    batch.reference_id    ?? null,
    idempotency_key: batch.idempotency_key ?? null,
    posted_at:       batch.posted_at       ?? null,
    reversed_at:     batch.reversed_at     ?? null,
    metadata:        batch.metadata        ?? {},
    created_at:      batch.created_at,
    updated_at:      batch.updated_at,

    summary: {
      total_credit: Number(summary.total_credit),
      total_debit:  Number(summary.total_debit),
      net:          Number(summary.net),
      entry_count:  Number(summary.entry_count),
      balanced:     Boolean(summary.balanced),
    },

    entries: entries.map(castEntry),

    linked_transaction: linkedTransaction
      ? {
          id:        linkedTransaction.id,
          reference: linkedTransaction.reference,
          type:      linkedTransaction.type,
          status:    linkedTransaction.status,
          amount:    Number(linkedTransaction.amount),
          currency:  linkedTransaction.currency,
        }
      : null,
  };
}
