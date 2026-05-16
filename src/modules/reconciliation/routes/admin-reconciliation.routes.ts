import { Router } from "express";
import { authenticate }  from "../../auth/middleware/authenticate";
import { requireRole }   from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listReportsController,
  listIssuesController,
  triggerReconciliationController,
} from "../controllers/admin-reconciliation.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get(  "/reconciliation/reports", ...adminGuard, adminRateLimiter, listReportsController);
router.get(  "/reconciliation/issues",  ...adminGuard, adminRateLimiter, listIssuesController);
router.post( "/reconciliation/run",     ...adminGuard, adminRateLimiter, triggerReconciliationController);

export { router as adminReconciliationRouter };
