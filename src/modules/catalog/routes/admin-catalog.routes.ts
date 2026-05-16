import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";

import {
  createServiceController,
  updateServiceController,
  createServicePlanController,
  updateServicePlanController,
} from "../controllers/admin-catalog.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.post("/services",           ...adminGuard, adminRateLimiter, createServiceController);
router.patch("/services/:id",      ...adminGuard, adminRateLimiter, updateServiceController);
router.post("/service-plans",      ...adminGuard, adminRateLimiter, createServicePlanController);
router.patch("/service-plans/:id", ...adminGuard, adminRateLimiter, updateServicePlanController);

export { router as adminCatalogRouter };
