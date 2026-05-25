import { Router } from 'express';
import { authenticate }       from '../../auth/middleware/authenticate';
import { requireRole }        from '../../auth/middleware/authorize';
import { adminRateLimiter }   from '../../../middleware/rateLimiter.redis';
import { getSystemHealthController } from '../controllers/admin-system-health.controller';

const router = Router();
const adminGuard = [authenticate, requireRole('admin', 'super_admin')] as const;

router.get(
  '/system-health',
  ...adminGuard,
  adminRateLimiter,
  getSystemHealthController,
);

export { router as adminSystemHealthRouter };
