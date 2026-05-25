// src/modules/backup/services/export.service.ts
//
// Streaming CSV exports for financial data.
//
// Every export:
//   - Streams row-by-row (avoids OOM on large datasets)
//   - Enforces a maximum date window (90 days default, 365 days max)
//   - Redacts sensitive fields (phone numbers masked, no passwords/tokens)
//   - Is capped at MAX_ROWS rows — export multiple windows for full history
//   - Logs to admin_activity_logs on completion

import type { Response } from 'express';
import { randomUUID }    from 'crypto';
import { getDbInstance } from '../../../db/knex';
import { logger }        from '../../../lib/logger';

const db      = getDbInstance();
const MAX_ROWS     = 500_000;
const BATCH_SIZE   = 2_000;
const DEFAULT_DAYS = 90;

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // RFC 4180: wrap in quotes if contains comma, quote, or newline
  if (s.includes(',') || s.includes('"') || s.includes('\r') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(headers: string[], row: Record<string, unknown>): string {
  return headers.map((h) => escapeCsv(row[h])).join(',') + '\r\n';
}

function maskPhone(v: unknown): string {
  if (typeof v !== 'string') return String(v ?? '');
  return v.replace(/(\+?234|0)[789]\d{9}/g, (m) => `***${m.slice(-4)}`);
}

// ── Date window helpers ───────────────────────────────────────────────────────

function resolveWindow(from?: string, to?: string): { fromDate: Date; toDate: Date } {
  const toDate   = to   ? new Date(to)   : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - DEFAULT_DAYS * 86400_000);

  // Cap at 365 days
  const maxFrom = new Date(toDate.getTime() - 365 * 86400_000);
  return {
    fromDate: fromDate < maxFrom ? maxFrom : fromDate,
    toDate,
  };
}

// ── Audit log helper ──────────────────────────────────────────────────────────

async function logExport(adminId: string, exportType: string, rowCount: number, params: Record<string, unknown>): Promise<void> {
  await db('admin_activity_logs').insert({
    id:            randomUUID(),
    admin_id:      adminId,
    action:        'data_export',
    description:   `Exported ${rowCount.toLocaleString()} rows of ${exportType} data`,
    resource_type: 'export',
    resource_id:   null,
    outcome:       'success',
    metadata:      JSON.stringify({ export_type: exportType, row_count: rowCount, params }),
    created_at:    new Date(),
  }).catch(() => {/* never let audit failure break the export */});
}

// ── Generic streaming engine ──────────────────────────────────────────────────

async function streamExport(opts: {
  res:       Response;
  filename:  string;
  headers:   string[];
  queryFn:   (limit: number, offset: number) => Promise<Record<string, unknown>[]>;
  adminId:   string;
  exportType:string;
  params:    Record<string, unknown>;
}): Promise<void> {
  const { res, filename, headers, queryFn, adminId, exportType, params } = opts;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens UTF-8 correctly
  res.write('﻿');
  res.write(headers.join(',') + '\r\n');

  let offset   = 0;
  let total    = 0;
  let keepGoing = true;

  while (keepGoing && total < MAX_ROWS) {
    const rows = await queryFn(BATCH_SIZE, offset);
    if (rows.length === 0) break;

    for (const row of rows) {
      res.write(csvRow(headers, row));
    }

    total    += rows.length;
    offset   += rows.length;
    keepGoing = rows.length === BATCH_SIZE;
  }

  logger.info('data_export_complete', { export_type: exportType, row_count: total, admin_id: adminId });
  void logExport(adminId, exportType, total, params);
  res.end();
}

// ── Export: transactions ──────────────────────────────────────────────────────

export async function exportTransactions(
  res:     Response,
  adminId: string,
  opts:    { from?: string; to?: string; status?: string; type?: string },
): Promise<void> {
  const { fromDate, toDate } = resolveWindow(opts.from, opts.to);
  const filename = `transactions-${fromDate.toISOString().slice(0,10)}-to-${toDate.toISOString().slice(0,10)}.csv`;

  const headers = [
    'reference', 'user_id', 'type', 'status', 'amount', 'currency',
    'provider', 'provider_reference', 'source_wallet_id', 'destination_wallet_id',
    'journal_batch_id', 'description', 'created_at', 'processed_at',
  ];

  await streamExport({
    res, filename, headers, adminId, exportType: 'transactions',
    params: opts,
    queryFn: (limit, offset) => {
      let q = db('transactions')
        .whereBetween('created_at', [fromDate, toDate])
        .select(headers)
        .orderBy('created_at', 'asc')
        .limit(limit)
        .offset(offset);
      if (opts.status) q = q.where('status', opts.status);
      if (opts.type)   q = q.where('type',   opts.type);
      return q as Promise<Record<string, unknown>[]>;
    },
  });
}

// ── Export: wallet ledger ─────────────────────────────────────────────────────

export async function exportWalletLedger(
  res:     Response,
  adminId: string,
  opts:    { from?: string; to?: string; walletId?: string },
): Promise<void> {
  const { fromDate, toDate } = resolveWindow(opts.from, opts.to);
  const filename = `wallet-ledger-${fromDate.toISOString().slice(0,10)}-to-${toDate.toISOString().slice(0,10)}.csv`;

  const headers = [
    'id', 'wallet_id', 'journal_batch_id', 'entry_type',
    'amount', 'signed_amount', 'running_balance', 'currency',
    'reference_type', 'reference_id', 'created_at',
  ];

  await streamExport({
    res, filename, headers, adminId, exportType: 'wallet_ledger',
    params: opts,
    queryFn: (limit, offset) => {
      let q = db('wallet_ledger')
        .whereBetween('created_at', [fromDate, toDate])
        .select(headers)
        .orderBy('created_at', 'asc')
        .limit(limit)
        .offset(offset);
      if (opts.walletId) q = q.where('wallet_id', opts.walletId);
      return q as Promise<Record<string, unknown>[]>;
    },
  });
}

// ── Export: users ─────────────────────────────────────────────────────────────

export async function exportUsers(
  res:     Response,
  adminId: string,
  opts:    { from?: string; to?: string; status?: string },
): Promise<void> {
  const { fromDate, toDate } = resolveWindow(opts.from, opts.to);
  const filename = `users-${fromDate.toISOString().slice(0,10)}-to-${toDate.toISOString().slice(0,10)}.csv`;

  // Never export password_hash, totp_secret, or any credential field
  const headers = [
    'id', 'email', 'status', 'kyc_level', 'is_email_verified',
    'first_name', 'last_name', 'created_at',
  ];

  await streamExport({
    res, filename, headers, adminId, exportType: 'users',
    params: opts,
    queryFn: async (limit, offset) => {
      let q = db('users')
        .whereBetween('created_at', [fromDate, toDate])
        .select(headers)
        .orderBy('created_at', 'asc')
        .limit(limit)
        .offset(offset);
      if (opts.status) q = q.where('status', opts.status);
      const rows = (await q) as Record<string, unknown>[];
      // Mask any phone numbers in email field (e.g., email aliases with digits)
      return rows.map((r) => ({ ...r, email: maskPhone(r['email']) }));
    },
  });
}

// ── Export: provider attempts ─────────────────────────────────────────────────

export async function exportProviderAttempts(
  res:     Response,
  adminId: string,
  opts:    { from?: string; to?: string; providerCode?: string; success?: boolean },
): Promise<void> {
  const { fromDate, toDate } = resolveWindow(opts.from, opts.to);
  const filename = `provider-attempts-${fromDate.toISOString().slice(0,10)}-to-${toDate.toISOString().slice(0,10)}.csv`;

  const headers = [
    'id', 'transaction_reference', 'provider_code', 'attempt_number',
    'success', 'error_message', 'latency_ms', 'created_at',
    // Never include request_payload / response_payload — may contain provider API keys
  ];

  await streamExport({
    res, filename, headers, adminId, exportType: 'provider_attempts',
    params: opts,
    queryFn: (limit, offset) => {
      let q = db('provider_attempts')
        .whereBetween('created_at', [fromDate, toDate])
        .select(headers)
        .orderBy('created_at', 'asc')
        .limit(limit)
        .offset(offset);
      if (opts.providerCode)             q = q.where('provider_code', opts.providerCode);
      if (opts.success !== undefined)    q = q.where('success', opts.success);
      return q as Promise<Record<string, unknown>[]>;
    },
  });
}

// ── Export: reconciliation reports ───────────────────────────────────────────

export async function exportReconciliationReports(
  res:     Response,
  adminId: string,
  opts:    { from?: string; to?: string },
): Promise<void> {
  const { fromDate, toDate } = resolveWindow(opts.from, opts.to);
  const filename = `reconciliation-reports-${fromDate.toISOString().slice(0,10)}-to-${toDate.toISOString().slice(0,10)}.csv`;

  const headers = [
    'id', 'report_type', 'status', 'issues_count', 'transactions_checked',
    'started_at', 'completed_at',
  ];

  await streamExport({
    res, filename, headers, adminId, exportType: 'reconciliation_reports',
    params: opts,
    queryFn: (limit, offset) =>
      db('reconciliation_reports')
        .whereBetween('started_at', [fromDate, toDate])
        .select(headers)
        .orderBy('started_at', 'asc')
        .limit(limit)
        .offset(offset) as Promise<Record<string, unknown>[]>,
  });
}
