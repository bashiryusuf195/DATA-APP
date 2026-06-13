import { Router }        from 'express';
import { authenticate }  from '../../auth/middleware/authenticate';
import { requireRole }   from '../../auth/middleware/authorize';
import {
  listAlertsController,
  alertsCountController,
  markAlertReadController,
  markAllAlertsReadController,
  resolveAlertController,
  deleteAlertController,
} from '../controllers/alerts.controller';

const router    = Router();
const adminGuard = [authenticate, requireRole('admin', 'super_admin')] as const;

router.get(   '/alerts',              ...adminGuard, listAlertsController);
router.get(   '/alerts/count',        ...adminGuard, alertsCountController);
router.put(   '/alerts/read-all',     ...adminGuard, markAllAlertsReadController);
router.put(   '/alerts/:id/read',     ...adminGuard, markAlertReadController);
router.put(   '/alerts/:id/resolve',  ...adminGuard, resolveAlertController);
router.delete('/alerts/:id',          ...adminGuard, deleteAlertController);

export { router as adminAlertsRouter };
