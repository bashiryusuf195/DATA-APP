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
  deleteServicePlanController,
  bulkToggleServicePlansController,
  getCategoryProvidersController,
  bulkAssignProviderController,
  bulkClearOverrideController,
  bulkSetProviderByIdController,
  bulkImportServicePlansController,
  listCategoryOrdersController,
  upsertCategoryOrdersController,
} from "../controllers/admin-catalog.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/service-plans/category-providers",    ...adminGuard, adminRateLimiter, getCategoryProvidersController);
router.get("/service-plans/category-orders",       ...adminGuard, adminRateLimiter, listCategoryOrdersController);
router.put("/service-plans/category-orders",       ...adminGuard, adminRateLimiter, upsertCategoryOrdersController);
router.post("/service-plans/bulk-assign-provider", ...adminGuard, adminRateLimiter, bulkAssignProviderController);
router.post("/service-plans/bulk-clear-override",  ...adminGuard, adminRateLimiter, bulkClearOverrideController);
router.post("/service-plans/bulk-set-provider",    ...adminGuard, adminRateLimiter, bulkSetProviderByIdController);
router.get("/services",                       ...adminGuard, adminRateLimiter, listServicesAdminController);
router.post("/services",                      ...adminGuard, adminRateLimiter, createServiceController);
router.patch("/services/:id",                 ...adminGuard, adminRateLimiter, updateServiceController);
router.get("/service-plans",                  ...adminGuard, adminRateLimiter, listServicePlansAdminController);
router.post("/service-plans",                 ...adminGuard, adminRateLimiter, createServicePlanController);
router.post("/service-plans/bulk-toggle",     ...adminGuard, adminRateLimiter, bulkToggleServicePlansController);
router.post("/service-plans/bulk-import",     ...adminGuard, adminRateLimiter, bulkImportServicePlansController);
router.patch("/service-plans/:id",            ...adminGuard, adminRateLimiter, updateServicePlanController);
router.delete("/service-plans/:id",           ...adminGuard, adminRateLimiter, deleteServicePlanController);

export { router as adminCatalogRouter };
