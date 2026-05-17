import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";

import {
  listServicesAdminController,
  listServicePlansAdminController,
  createServiceController,
  updateServiceController,
  createServicePlanController,
  updateServicePlanController,
} from "../controllers/admin-catalog.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/services",            ...adminGuard, adminRateLimiter, listServicesAdminController);
router.post("/services",           ...adminGuard, adminRateLimiter, createServiceController);
router.patch("/services/:id",      ...adminGuard, adminRateLimiter, updateServiceController);
router.get("/service-plans",       ...adminGuard, adminRateLimiter, listServicePlansAdminController);
router.post("/service-plans",      ...adminGuard, adminRateLimiter, createServicePlanController);
router.patch("/service-plans/:id", ...adminGuard, adminRateLimiter, updateServicePlanController);

export { router as adminCatalogRouter };
