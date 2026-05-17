import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listHealthMetricsController,
  getHealthMetricsController,
  resetCircuitController,
} from "../controllers/admin-health-metrics.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get(
  "/provider-health-metrics",
  ...adminGuard,
  adminRateLimiter,
  listHealthMetricsController
);

router.get(
  "/provider-health-metrics/:providerCode",
  ...adminGuard,
  adminRateLimiter,
  getHealthMetricsController
);

router.post(
  "/providers/:providerCode/reset-circuit",
  ...adminGuard,
  adminRateLimiter,
  resetCircuitController
);

export { router as adminHealthMetricsRouter };
