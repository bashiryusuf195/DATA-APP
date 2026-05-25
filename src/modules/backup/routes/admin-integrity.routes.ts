import { Router } from 'express';
import { authenticate }         from '../../auth/middleware/authenticate';
import { requireRole }          from '../../auth/middleware/authorize';
import { adminRateLimiter, adminSensitiveLimiter } from '../../../middleware/rateLimiter.redis';
import {
  runIntegrityCheckController,
  listIntegrityReportsController,
  getIntegrityReportController,
  markTransactionFailedController,
  triggerReconciliationController,
  issueManualRefundController,
  verifyWalletController,
  flagOrphanController,
} from '../controllers/admin-integrity.controller';

const router = Router();
const adminGuard      = [authenticate, requireRole('admin', 'super_admin')] as const;
const superAdminGuard = [authenticate, requireRole('super_admin')] as const;

// ── Integrity checks (read-only) ──────────────────────────────────────────────
router.post('/integrity/run',            ...adminGuard,      adminRateLimiter,      runIntegrityCheckController);
router.get( '/integrity/reports',        ...adminGuard,      adminRateLimiter,      listIntegrityReportsController);
router.get( '/integrity/reports/:id',    ...adminGuard,      adminRateLimiter,      getIntegrityReportController);

// ── Repair tools (sensitive — super_admin or admin + sensitive limiter) ───────
router.post('/repair/transactions/:reference/mark-failed',   ...adminGuard,      adminSensitiveLimiter, markTransactionFailedController);
router.post('/repair/transactions/:reference/reconcile',     ...adminGuard,      adminSensitiveLimiter, triggerReconciliationController);
router.post('/repair/transactions/:reference/flag-orphan',   ...adminGuard,      adminSensitiveLimiter, flagOrphanController);
router.post('/repair/manual-refund',                         ...superAdminGuard, adminSensitiveLimiter, issueManualRefundController);
router.get( '/repair/wallets/:walletId/verify',              ...adminGuard,      adminRateLimiter,      verifyWalletController);

export { router as adminIntegrityRouter };
