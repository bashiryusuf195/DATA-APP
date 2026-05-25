// src/modules/backup/services/repair.service.ts
//
// Recovery-safe repair tools for administrators.
//
// IMPORTANT invariants:
//   - NEVER directly INSERT/UPDATE/DELETE wallet_ledger rows
//   - NEVER directly INSERT/UPDATE wallet_journal_batches rows
//   - All balance changes MUST go through WalletService (credit/debit/transfer)
//     which calls the PL/pgSQL functions and maintains double-entry accounting
//   - Every repair operation is logged to admin_activity_logs BEFORE execution
//   - Operations are idempotent — safe to retry after partial failure

import { randomUUID } from 'crypto';
import { getDbInstance }  from '../../../db/knex';
import { logger }         from '../../../lib/logger';
import { WalletService }  from '../../../services/wallet/WalletService';
import { reconciliationQueue } from '../../reconciliation/workers/reconciliation.worker';
import { defaultJobOptions }   from '../../queue/config/queue.config';

const db            = getDbInstance();
const walletService = new WalletService(db);

// ── Audit log helper ──────────────────────────────────────────────────────────

async function auditRepair(opts: {
  adminId:      string;
  action:       string;
  description:  string;
  resourceType: string;
  resourceId:   string | null;
  oldValues?:   Record<string, unknown>;
  newValues?:   Record<string, unknown>;
  metadata?:    Record<string, unknown>;
  outcome:      'success' | 'failure' | 'partial';
}): Promise<void> {
  await db('admin_activity_logs').insert({
    id:            randomUUID(),
    admin_id:      opts.adminId,
    action:        opts.action,
    description:   opts.description,
    resource_type: opts.resourceType,
    resource_id:   opts.resourceId ?? null,
    old_values:    opts.oldValues  ? JSON.stringify(opts.oldValues)  : null,
    new_values:    opts.newValues  ? JSON.stringify(opts.newValues)  : null,
    outcome:       opts.outcome,
    metadata:      JSON.stringify(opts.metadata ?? {}),
    created_at:    new Date(),
  }).catch((auditErr: Error) => {
    // Audit failures must never block the repair — log and continue
    logger.error('audit_log_failed', { action: opts.action, error: auditErr.message });
  });
}

// ── 1. Mark stuck processing transactions as failed ───────────────────────────
// Safe: only moves 'processing' status to 'failed'. Does NOT touch the ledger.
// The existing reconciliation worker will detect the failed status and check
// whether a refund is owed.

export async function markStuckTransactionFailed(
  reference: string,
  adminId:   string,
  reason:    string,
): Promise<{ success: boolean; message: string }> {
  const txn = await db('transactions').where('reference', reference).first();

  if (!txn) {
    return { success: false, message: `Transaction ${reference} not found` };
  }

  if (txn.status !== 'processing' && txn.status !== 'pending') {
    return {
      success: false,
      message: `Transaction ${reference} is in status '${txn.status}' — only 'processing' or 'pending' transactions can be marked failed`,
    };
  }

  // Log intent BEFORE making changes
  await auditRepair({
    adminId,
    action:       'repair_mark_failed',
    description:  `Manually marked transaction ${reference} as failed (was: ${txn.status}). Reason: ${reason}`,
    resourceType: 'transaction',
    resourceId:   reference,
    oldValues:    { status: txn.status },
    newValues:    { status: 'failed' },
    metadata:     { reason, triggered_by: 'manual_repair' },
    outcome:      'success',
  });

  await db('transactions')
    .where('reference', reference)
    .update({
      status:     'failed',
      metadata:   db.raw(`metadata || ?::jsonb`, [
        JSON.stringify({ repair: { marked_failed_by: adminId, reason, at: new Date().toISOString() } }),
      ]),
    });

  logger.warn('repair_mark_failed', { reference, admin_id: adminId, reason });

  return { success: true, message: `Transaction ${reference} marked as failed` };
}

// ── 2. Trigger manual reconciliation for a specific transaction ───────────────
// Safe: enqueues a read-only reconciliation job. The reconciliation service
// will check with the provider and issue a refund if appropriate via the
// standard WalletService pathway.

export async function triggerManualReconciliation(
  reference: string,
  adminId:   string,
): Promise<{ success: boolean; message: string; jobId?: string }> {
  const txn = await db('transactions').where('reference', reference).first();

  if (!txn) {
    return { success: false, message: `Transaction ${reference} not found` };
  }

  await auditRepair({
    adminId,
    action:       'repair_trigger_reconciliation',
    description:  `Manually triggered reconciliation for transaction ${reference} (status: ${txn.status})`,
    resourceType: 'transaction',
    resourceId:   reference,
    metadata:     { reference, triggered_by: 'manual_repair' },
    outcome:      'success',
  });

  const job = await reconciliationQueue.add(
    'manual_reconciliation',
    { report_type: 'manual', triggered_by: 'manual', transaction_reference: reference },
    { ...defaultJobOptions, attempts: 1 },
  );

  logger.info('repair_reconciliation_enqueued', { reference, admin_id: adminId, job_id: job.id });

  return {
    success: true,
    message: `Reconciliation job enqueued for ${reference}`,
    jobId:   job.id,
  };
}

// ── 3. Issue a manual refund (credit) to a user wallet ───────────────────────
// Uses WalletService.credit() — preserves all ledger rules and double-entry.
// This is the ONLY approved way to add money to a wallet outside normal flows.

export async function issueManualRefund(opts: {
  adminId:      string;
  userId:       string;
  amount:       number;
  reason:       string;
  reference:    string;   // transaction reference being refunded (for traceability)
  settlementWalletId: string;
}): Promise<{ success: boolean; message: string; newBalance?: number }> {
  const { adminId, userId, amount, reason, reference, settlementWalletId } = opts;

  if (amount <= 0) {
    return { success: false, message: 'Refund amount must be positive' };
  }

  const userWallet = await db('wallets')
    .where({ user_id: userId, wallet_type: 'user' })
    .first();

  if (!userWallet) {
    return { success: false, message: `No active user wallet found for user ${userId}` };
  }

  const idempotencyKey = `manual_refund_${reference}_${adminId}`;

  // Log intent BEFORE the credit
  await auditRepair({
    adminId,
    action:       'manual_refund',
    description:  `Manual refund of ₦${amount.toFixed(2)} to user ${userId} for transaction ${reference}. Reason: ${reason}`,
    resourceType: 'wallet',
    resourceId:   userWallet.id,
    metadata:     { user_id: userId, amount, reason, reference, idempotency_key: idempotencyKey },
    outcome:      'success',
  });

  try {
    const result = await walletService.credit({
      wallet_id:        userWallet.id,
      contra_wallet_id: settlementWalletId,
      amount,
      currency:         'NGN',
      description:      `Manual refund for ${reference}: ${reason}`,
      idempotency_key:  idempotencyKey,
      reference_type:   'manual_refund',
      reference_id:     userWallet.id,
      metadata:         { admin_id: adminId, original_reference: reference, reason },
    });

    const newBalance = await walletService.getBalance(userWallet.id).catch(() => undefined);

    logger.info('manual_refund_issued', {
      admin_id:     adminId,
      user_id:      userId,
      amount,
      reference,
      idempotent:   result.idempotent,
      new_balance:  newBalance,
    });

    return {
      success:    true,
      message:    `Refund of ₦${amount.toFixed(2)} issued to user ${userId}`,
      newBalance,
    };
  } catch (err) {
    await auditRepair({
      adminId,
      action:       'manual_refund',
      description:  `Manual refund FAILED for user ${userId} transaction ${reference}: ${(err as Error).message}`,
      resourceType: 'wallet',
      resourceId:   userWallet.id,
      metadata:     { user_id: userId, amount, reason, reference, error: (err as Error).message },
      outcome:      'failure',
    });

    return { success: false, message: (err as Error).message };
  }
}

// ── 4. Read-only wallet balance validation ────────────────────────────────────
// Returns the computed vs snapshot balance for a wallet. Never modifies data.

export async function verifyWalletBalance(
  walletId: string,
  adminId:  string,
): Promise<{
  wallet_id:        string;
  computed_balance: number;
  snapshot_balance: number | null;
  delta:            number;
  is_consistent:    boolean;
}> {
  const rows = await db.raw<{ rows: Array<{
    wallet_id:        string;
    computed_balance: string;
    snapshot_balance: string | null;
  }> }>(`
    WITH latest_snapshot AS (
      SELECT DISTINCT ON (wallet_id)
        wallet_id,
        running_balance
      FROM wallet_ledger
      WHERE wallet_id = ?
      ORDER BY wallet_id, created_at DESC
    ),
    ledger_totals AS (
      SELECT wallet_id, COALESCE(SUM(signed_amount), 0) AS computed_balance
      FROM wallet_ledger
      WHERE wallet_id = ?
      GROUP BY wallet_id
    )
    SELECT
      COALESCE(lt.wallet_id, ls.wallet_id)::text AS wallet_id,
      COALESCE(lt.computed_balance, 0)::text     AS computed_balance,
      ls.running_balance::text                   AS snapshot_balance
    FROM ledger_totals lt
    FULL OUTER JOIN latest_snapshot ls ON ls.wallet_id = lt.wallet_id
  `, [walletId, walletId]);

  const row = rows.rows[0];
  if (!row) {
    return { wallet_id: walletId, computed_balance: 0, snapshot_balance: null, delta: 0, is_consistent: true };
  }

  const computed  = parseFloat(row.computed_balance);
  const snapshot  = row.snapshot_balance != null ? parseFloat(row.snapshot_balance) : null;
  const delta     = snapshot != null ? Math.abs(computed - snapshot) : 0;

  logger.info('wallet_balance_verified', { wallet_id: walletId, admin_id: adminId, computed, snapshot, delta });

  return {
    wallet_id:        walletId,
    computed_balance: computed,
    snapshot_balance: snapshot,
    delta,
    is_consistent:    delta < 0.001,
  };
}

// ── 5. Flag orphan transaction for manual investigation ───────────────────────
// Adds a note to the transaction's metadata and logs to admin_activity_logs.
// Does NOT modify the ledger. An operations team member must investigate.

export async function flagOrphanTransaction(
  reference: string,
  adminId:   string,
  notes:     string,
): Promise<{ success: boolean; message: string }> {
  const txn = await db('transactions').where('reference', reference).first();
  if (!txn) return { success: false, message: `Transaction ${reference} not found` };

  await auditRepair({
    adminId,
    action:       'repair_flag_orphan',
    description:  `Flagged orphan transaction ${reference} for investigation. Notes: ${notes}`,
    resourceType: 'transaction',
    resourceId:   reference,
    metadata:     { reference, status: txn.status, type: txn.type, notes },
    outcome:      'success',
  });

  await db('transactions')
    .where('reference', reference)
    .update({
      metadata: db.raw(`metadata || ?::jsonb`, [
        JSON.stringify({
          orphan_flag: {
            flagged_by:  adminId,
            flagged_at:  new Date().toISOString(),
            notes,
          },
        }),
      ]),
    });

  logger.warn('orphan_transaction_flagged', { reference, admin_id: adminId, notes });

  return { success: true, message: `Transaction ${reference} flagged for investigation` };
}
