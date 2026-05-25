import { Router } from 'express';
import { authenticate }         from '../../auth/middleware/authenticate';
import { requireRole }          from '../../auth/middleware/authorize';
import { adminSensitiveLimiter, adminRateLimiter } from '../../../middleware/rateLimiter.redis';
import {
  exportTransactionsController,
  exportWalletLedgerController,
  exportUsersController,
  exportProviderAttemptsController,
  exportReconciliationReportsController,
} from '../controllers/admin-backup.controller';

const router = Router();
const superAdminGuard = [authenticate, requireRole('super_admin')] as const;
const adminGuard      = [authenticate, requireRole('admin', 'super_admin')] as const;

// ── CSV Export endpoints ──────────────────────────────────────────────────────
// All exports are super_admin or admin only, rate-limited to prevent bulk scraping.

router.get('/export/transactions',          ...adminGuard,      adminSensitiveLimiter, exportTransactionsController);
router.get('/export/wallet-ledger',         ...superAdminGuard, adminSensitiveLimiter, exportWalletLedgerController);
router.get('/export/users',                 ...superAdminGuard, adminSensitiveLimiter, exportUsersController);
router.get('/export/provider-attempts',     ...adminGuard,      adminSensitiveLimiter, exportProviderAttemptsController);
router.get('/export/reconciliation-reports',...adminGuard,      adminRateLimiter,      exportReconciliationReportsController);

export { router as adminBackupRouter };
