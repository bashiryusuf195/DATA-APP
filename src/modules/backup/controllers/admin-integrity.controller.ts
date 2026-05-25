// src/modules/backup/controllers/admin-integrity.controller.ts
//
// Integrity check and repair endpoints for admin use.
// All repair operations are audited before execution.

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  runAllIntegrityChecks,
  saveIntegrityReport,
  listIntegrityReports,
  getIntegrityReport,
} from '../services/integrity-check.service';
import {
  markStuckTransactionFailed,
  triggerManualReconciliation,
  issueManualRefund,
  verifyWalletBalance,
  flagOrphanTransaction,
} from '../services/repair.service';

function adminId(req: Request): string {
  return req.user!.id;
}

// ── Integrity checks ──────────────────────────────────────────────────────────

export async function runIntegrityCheckController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report   = await runAllIntegrityChecks();
    const reportId = await saveIntegrityReport(report, adminId(req));
    res.status(200).json({ success: true, data: { ...report, id: reportId } });
  } catch (err) { next(err); }
}

export async function listIntegrityReportsController(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reports = await listIntegrityReports(30);
    res.status(200).json({ success: true, data: reports });
  } catch (err) { next(err); }
}

export async function getIntegrityReportController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const report = await getIntegrityReport(id);
    if (!report) { res.status(404).json({ success: false, error: 'Report not found' }); return; }
    res.status(200).json({ success: true, data: report });
  } catch (err) { next(err); }
}

// ── Repair: mark stuck transaction failed ─────────────────────────────────────

const MarkFailedSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export async function markTransactionFailedController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reference } = req.params as { reference: string };
    const { reason }    = MarkFailedSchema.parse(req.body);
    const result        = await markStuckTransactionFailed(reference, adminId(req), reason);
    res.status(result.success ? 200 : 400).json({ success: result.success, data: result });
  } catch (err) { next(err); }
}

// ── Repair: trigger reconciliation ────────────────────────────────────────────

export async function triggerReconciliationController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reference } = req.params as { reference: string };
    const result        = await triggerManualReconciliation(reference, adminId(req));
    res.status(result.success ? 200 : 400).json({ success: result.success, data: result });
  } catch (err) { next(err); }
}

// ── Repair: manual refund ─────────────────────────────────────────────────────

const RefundSchema = z.object({
  user_id:              z.string().uuid(),
  amount:               z.number().positive().max(500_000),
  reason:               z.string().min(10),
  original_reference:   z.string().min(1),
  settlement_wallet_id: z.string().uuid(),
});

export async function issueManualRefundController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input  = RefundSchema.parse(req.body);
    const result = await issueManualRefund({
      adminId:            adminId(req),
      userId:             input.user_id,
      amount:             input.amount,
      reason:             input.reason,
      reference:          input.original_reference,
      settlementWalletId: input.settlement_wallet_id,
    });
    res.status(result.success ? 200 : 400).json({ success: result.success, data: result });
  } catch (err) { next(err); }
}

// ── Repair: verify wallet balance ─────────────────────────────────────────────

export async function verifyWalletController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { walletId } = req.params as { walletId: string };
    const result       = await verifyWalletBalance(walletId, adminId(req));
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Repair: flag orphan transaction ──────────────────────────────────────────

const FlagOrphanSchema = z.object({
  notes: z.string().min(10, 'Notes must be at least 10 characters'),
});

export async function flagOrphanController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reference } = req.params as { reference: string };
    const { notes }     = FlagOrphanSchema.parse(req.body);
    const result        = await flagOrphanTransaction(reference, adminId(req), notes);
    res.status(result.success ? 200 : 400).json({ success: result.success, data: result });
  } catch (err) { next(err); }
}
