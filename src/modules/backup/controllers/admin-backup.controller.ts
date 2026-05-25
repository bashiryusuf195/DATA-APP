// src/modules/backup/controllers/admin-backup.controller.ts
//
// CSV export endpoints. Streams data directly to the client — no temp files.
// All exports are logged to admin_activity_logs inside the export service.

import type { Request, Response, NextFunction } from 'express';
import {
  exportTransactions,
  exportWalletLedger,
  exportUsers,
  exportProviderAttempts,
  exportReconciliationReports,
} from '../services/export.service';

function adminId(req: Request): string {
  return req.user!.id;
}

export async function exportTransactionsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await exportTransactions(res, adminId(req), {
      from:   req.query.from   as string | undefined,
      to:     req.query.to     as string | undefined,
      status: req.query.status as string | undefined,
      type:   req.query.type   as string | undefined,
    });
  } catch (err) { next(err); }
}

export async function exportWalletLedgerController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await exportWalletLedger(res, adminId(req), {
      from:     req.query.from      as string | undefined,
      to:       req.query.to        as string | undefined,
      walletId: req.query.wallet_id as string | undefined,
    });
  } catch (err) { next(err); }
}

export async function exportUsersController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await exportUsers(res, adminId(req), {
      from:   req.query.from   as string | undefined,
      to:     req.query.to     as string | undefined,
      status: req.query.status as string | undefined,
    });
  } catch (err) { next(err); }
}

export async function exportProviderAttemptsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const successParam = req.query.success as string | undefined;
    await exportProviderAttempts(res, adminId(req), {
      from:         req.query.from          as string | undefined,
      to:           req.query.to            as string | undefined,
      providerCode: req.query.provider_code as string | undefined,
      success:      successParam !== undefined ? successParam === 'true' : undefined,
    });
  } catch (err) { next(err); }
}

export async function exportReconciliationReportsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await exportReconciliationReports(res, adminId(req), {
      from: req.query.from as string | undefined,
      to:   req.query.to   as string | undefined,
    });
  } catch (err) { next(err); }
}
