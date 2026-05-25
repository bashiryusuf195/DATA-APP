// src/modules/backup/services/integrity-check.service.ts
//
// Read-only integrity checks that complement the existing reconciliation worker.
//
// These checks are DISTINCT from those in reconciliation.service.ts — they
// target structural corruption that reconciliation does not catch:
//   1. Orphan successful transactions  — successful but no wallet journal posted
//   2. Negative user wallet balances   — user wallet went below zero
//   3. Duplicate provider references   — same provider_reference on 2+ successes
//   4. Duplicate successful purchases  — same user+type+amount within 60 seconds
//   5. Ghost journal batches           — posted batch but zero ledger entries
//
// Every check returns a typed result so callers (daily worker + admin UI) can
// display and store structured data without re-parsing strings.

import { getDbInstance } from '../../../db/knex';
import { logger }        from '../../../lib/logger';
import { errorReporter } from '../../../lib/error-reporter';

const db = getDbInstance();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckResult<T> {
  check:        string;
  status:       'ok' | 'issues_found' | 'error';
  issue_count:  number;
  issues:       T[];
  ran_at:       string;
  duration_ms:  number;
  error?:       string;
}

export interface OrphanTxn {
  reference:  string;
  user_id:    string;
  type:       string;
  amount:     number;
  created_at: string;
}

export interface NegativeBalance {
  wallet_id:   string;
  user_id:     string | null;
  wallet_type: string;
  balance:     number;
}

export interface DuplicateProviderRef {
  provider_reference: string;
  provider:           string;
  count:              number;
  references:         string[];
}

export interface DuplicatePurchase {
  user_id:    string;
  type:       string;
  amount:     number;
  count:      number;
  first_at:   string;
  last_at:    string;
  references: string[];
}

export interface GhostBatch {
  batch_id:       string;
  reference_type: string;
  reference_id:   string | null;
  posted_at:      string;
}

export interface IntegrityReport {
  orphan_transactions:   CheckResult<OrphanTxn>;
  negative_balances:     CheckResult<NegativeBalance>;
  duplicate_provider_refs: CheckResult<DuplicateProviderRef>;
  duplicate_purchases:   CheckResult<DuplicatePurchase>;
  ghost_batches:         CheckResult<GhostBatch>;
  total_issues:          number;
  critical_issues:       number;
  ran_at:                string;
  duration_ms:           number;
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkOrphanTransactions(): Promise<CheckResult<OrphanTxn>> {
  const start = Date.now();
  const ranAt = new Date().toISOString();
  try {
    // Successful purchase transactions that have no posted wallet journal batch.
    // Wallet-funding transactions may legitimately have NULL journal_batch_id
    // in edge cases, so we only flag purchase-type transactions.
    const rows = await db.raw<{ rows: OrphanTxn[] }>(`
      SELECT
        t.reference,
        t.user_id::text,
        t.type,
        t.amount::float AS amount,
        t.created_at::text
      FROM transactions t
      LEFT JOIN wallet_journal_batches wjb ON wjb.id = t.journal_batch_id
      WHERE t.status = 'successful'
        AND t.type IN ('airtime', 'data', 'electricity', 'cable_tv', 'exam_pin')
        AND (t.journal_batch_id IS NULL OR wjb.status != 'posted')
        AND t.created_at > NOW() - INTERVAL '30 days'
      ORDER BY t.created_at DESC
      LIMIT 100
    `);

    const issues = rows.rows;
    return {
      check:       'orphan_transactions',
      status:      issues.length > 0 ? 'issues_found' : 'ok',
      issue_count: issues.length,
      issues,
      ran_at:      ranAt,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    logger.error('integrity_check_error', { check: 'orphan_transactions', error: (err as Error).message });
    return { check: 'orphan_transactions', status: 'error', issue_count: 0, issues: [],
      ran_at: ranAt, duration_ms: Date.now() - start, error: (err as Error).message };
  }
}

async function checkNegativeBalances(): Promise<CheckResult<NegativeBalance>> {
  const start = Date.now();
  const ranAt = new Date().toISOString();
  try {
    // User wallets must never go negative (overdraft_limit handles exceptions).
    // This reads from v_wallet_balances view which computes SUM(signed_amount).
    const rows = await db.raw<{ rows: NegativeBalance[] }>(`
      SELECT
        w.id::text   AS wallet_id,
        w.user_id::text,
        w.wallet_type,
        vwb.balance::float AS balance
      FROM wallets w
      JOIN v_wallet_balances vwb ON vwb.wallet_id = w.id
      WHERE vwb.balance < 0
        AND w.wallet_type = 'user'
        AND w.status = 'active'
      ORDER BY vwb.balance ASC
      LIMIT 50
    `);

    const issues = rows.rows;
    return {
      check:       'negative_balances',
      status:      issues.length > 0 ? 'issues_found' : 'ok',
      issue_count: issues.length,
      issues,
      ran_at:      ranAt,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    logger.error('integrity_check_error', { check: 'negative_balances', error: (err as Error).message });
    return { check: 'negative_balances', status: 'error', issue_count: 0, issues: [],
      ran_at: ranAt, duration_ms: Date.now() - start, error: (err as Error).message };
  }
}

async function checkDuplicateProviderRefs(): Promise<CheckResult<DuplicateProviderRef>> {
  const start = Date.now();
  const ranAt = new Date().toISOString();
  try {
    // Multiple successful transactions sharing a provider_reference indicates a
    // double-credit risk — the provider confirmed one payment but we booked it twice.
    const rows = await db.raw<{ rows: Array<{
      provider_reference: string;
      provider:           string;
      count:              string;
      references:         string;
    }>}>(`
      SELECT
        provider_reference,
        provider,
        COUNT(*)::text         AS count,
        array_agg(reference)   AS references
      FROM transactions
      WHERE status = 'successful'
        AND provider_reference IS NOT NULL
        AND provider_reference != ''
        AND created_at > NOW() - INTERVAL '90 days'
      GROUP BY provider_reference, provider
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `);

    const issues: DuplicateProviderRef[] = rows.rows.map((r) => ({
      provider_reference: r.provider_reference,
      provider:           r.provider,
      count:              parseInt(r.count, 10),
      references:         Array.isArray(r.references) ? r.references : [r.references],
    }));

    return {
      check:       'duplicate_provider_refs',
      status:      issues.length > 0 ? 'issues_found' : 'ok',
      issue_count: issues.length,
      issues,
      ran_at:      ranAt,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    logger.error('integrity_check_error', { check: 'duplicate_provider_refs', error: (err as Error).message });
    return { check: 'duplicate_provider_refs', status: 'error', issue_count: 0, issues: [],
      ran_at: ranAt, duration_ms: Date.now() - start, error: (err as Error).message };
  }
}

async function checkDuplicatePurchases(): Promise<CheckResult<DuplicatePurchase>> {
  const start = Date.now();
  const ranAt = new Date().toISOString();
  try {
    // Same user + service type + amount completed within a 60-second window.
    // This indicates the duplicate-purchase guard was bypassed or there is a
    // legitimate re-purchase the user intended.
    const rows = await db.raw<{ rows: Array<{
      user_id:    string;
      type:       string;
      amount:     string;
      count:      string;
      first_at:   string;
      last_at:    string;
      references: string;
    }>}>(`
      WITH ranked AS (
        SELECT
          reference,
          user_id,
          type,
          amount,
          created_at,
          LAG(created_at) OVER (
            PARTITION BY user_id, type, amount
            ORDER BY created_at
          ) AS prev_at
        FROM transactions
        WHERE status = 'successful'
          AND type IN ('airtime', 'data', 'electricity', 'cable_tv', 'exam_pin')
          AND created_at > NOW() - INTERVAL '24 hours'
      )
      SELECT
        user_id::text,
        type,
        amount::float::text   AS amount,
        COUNT(*)::text        AS count,
        MIN(created_at)::text AS first_at,
        MAX(created_at)::text AS last_at,
        array_agg(reference)  AS references
      FROM ranked
      WHERE prev_at IS NOT NULL
        AND created_at - prev_at < INTERVAL '60 seconds'
      GROUP BY user_id, type, amount
      ORDER BY count DESC
      LIMIT 50
    `);

    const issues: DuplicatePurchase[] = rows.rows.map((r) => ({
      user_id:    r.user_id,
      type:       r.type,
      amount:     parseFloat(r.amount),
      count:      parseInt(r.count, 10),
      first_at:   r.first_at,
      last_at:    r.last_at,
      references: Array.isArray(r.references) ? r.references : [r.references],
    }));

    return {
      check:       'duplicate_purchases',
      status:      issues.length > 0 ? 'issues_found' : 'ok',
      issue_count: issues.length,
      issues,
      ran_at:      ranAt,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    logger.error('integrity_check_error', { check: 'duplicate_purchases', error: (err as Error).message });
    return { check: 'duplicate_purchases', status: 'error', issue_count: 0, issues: [],
      ran_at: ranAt, duration_ms: Date.now() - start, error: (err as Error).message };
  }
}

async function checkGhostBatches(): Promise<CheckResult<GhostBatch>> {
  const start = Date.now();
  const ranAt = new Date().toISOString();
  try {
    // Journal batches marked 'posted' but with zero matching wallet_ledger entries.
    // A correctly posted batch always writes at least 2 ledger entries (double-entry).
    const rows = await db.raw<{ rows: GhostBatch[] }>(`
      SELECT
        wjb.id::text         AS batch_id,
        wjb.reference_type,
        wjb.reference_id::text,
        wjb.posted_at::text
      FROM wallet_journal_batches wjb
      LEFT JOIN wallet_ledger wl ON wl.journal_batch_id = wjb.id
      WHERE wjb.status = 'posted'
        AND wjb.posted_at > NOW() - INTERVAL '30 days'
      GROUP BY wjb.id, wjb.reference_type, wjb.reference_id, wjb.posted_at
      HAVING COUNT(wl.id) = 0
      ORDER BY wjb.posted_at DESC
      LIMIT 50
    `);

    const issues = rows.rows;
    return {
      check:       'ghost_batches',
      status:      issues.length > 0 ? 'issues_found' : 'ok',
      issue_count: issues.length,
      issues,
      ran_at:      ranAt,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    logger.error('integrity_check_error', { check: 'ghost_batches', error: (err as Error).message });
    return { check: 'ghost_batches', status: 'error', issue_count: 0, issues: [],
      ran_at: ranAt, duration_ms: Date.now() - start, error: (err as Error).message };
  }
}

// ── Full report ───────────────────────────────────────────────────────────────

export async function runAllIntegrityChecks(): Promise<IntegrityReport> {
  const start = Date.now();
  const ranAt = new Date().toISOString();

  logger.info('integrity_check_started');

  const [orphans, negatives, dupProvRefs, dupPurchases, ghosts] = await Promise.all([
    checkOrphanTransactions(),
    checkNegativeBalances(),
    checkDuplicateProviderRefs(),
    checkDuplicatePurchases(),
    checkGhostBatches(),
  ]);

  const totalIssues =
    orphans.issue_count + negatives.issue_count +
    dupProvRefs.issue_count + dupPurchases.issue_count + ghosts.issue_count;

  // Critical = negative balances or duplicate provider refs (money-at-risk)
  const criticalIssues = negatives.issue_count + dupProvRefs.issue_count;

  if (criticalIssues > 0) {
    errorReporter.captureMessage('integrity_critical_issues_found', 'error', {
      critical_issues:   criticalIssues,
      negative_balances: negatives.issue_count,
      duplicate_refs:    dupProvRefs.issue_count,
    });
  } else if (totalIssues > 0) {
    logger.warn('integrity_check_issues_found', { total_issues: totalIssues });
  }

  const report: IntegrityReport = {
    orphan_transactions:     orphans,
    negative_balances:       negatives,
    duplicate_provider_refs: dupProvRefs,
    duplicate_purchases:     dupPurchases,
    ghost_batches:           ghosts,
    total_issues:            totalIssues,
    critical_issues:         criticalIssues,
    ran_at:                  ranAt,
    duration_ms:             Date.now() - start,
  };

  logger.info('integrity_check_complete', {
    total_issues:    totalIssues,
    critical_issues: criticalIssues,
    duration_ms:     report.duration_ms,
  });

  return report;
}

// ── Persist report ────────────────────────────────────────────────────────────

export async function saveIntegrityReport(
  report:  IntegrityReport,
  runBy:   string = 'system',
): Promise<string> {
  const checksRun = 5;
  const [row] = await db('integrity_reports').insert({
    run_at:          report.ran_at,
    run_by:          runBy,
    status:          report.total_issues === 0 ? 'ok' : 'issues_found',
    checks_run:      checksRun,
    issues_found:    report.total_issues,
    critical_issues: report.critical_issues,
    results:         JSON.stringify({
      orphan_transactions:     report.orphan_transactions,
      negative_balances:       report.negative_balances,
      duplicate_provider_refs: report.duplicate_provider_refs,
      duplicate_purchases:     report.duplicate_purchases,
      ghost_batches:           report.ghost_batches,
    }),
    duration_ms: report.duration_ms,
    metadata:    JSON.stringify({}),
  }).returning('id');

  return row.id as string;
}

// ── List past reports ─────────────────────────────────────────────────────────

export async function listIntegrityReports(limit = 20): Promise<Array<{
  id:              string;
  run_at:          string;
  run_by:          string;
  status:          string;
  issues_found:    number;
  critical_issues: number;
  duration_ms:     number | null;
}>> {
  return db('integrity_reports')
    .select('id', 'run_at', 'run_by', 'status', 'issues_found', 'critical_issues', 'duration_ms')
    .orderBy('run_at', 'desc')
    .limit(limit) as Promise<Array<{
      id: string; run_at: string; run_by: string; status: string;
      issues_found: number; critical_issues: number; duration_ms: number | null;
    }>>;
}

export async function getIntegrityReport(id: string): Promise<{
  id: string; run_at: string; run_by: string; status: string;
  checks_run: number; issues_found: number; critical_issues: number;
  results: Record<string, unknown>; duration_ms: number | null;
} | null> {
  const row = await db('integrity_reports').where('id', id).first();
  return row ?? null;
}
