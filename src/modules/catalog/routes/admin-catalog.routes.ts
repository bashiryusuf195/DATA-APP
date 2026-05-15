import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";

import {
  createServiceController,
  updateServiceController,
  createServicePlanController,
  updateServicePlanController,
} from "../controllers/admin-catalog.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.post("/services",           ...adminGuard, createServiceController);
router.patch("/services/:id",      ...adminGuard, updateServiceController);
router.post("/service-plans",      ...adminGuard, createServicePlanController);
router.patch("/service-plans/:id", ...adminGuard, updateServicePlanController);

export { router as adminCatalogRouter };
