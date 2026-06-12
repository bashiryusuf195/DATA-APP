import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listPlanMappingsController,
  createPlanMappingController,
  updatePlanMappingController,
  deletePlanMappingController,
} from "../controllers/provider-plan-mappings.controller";

const router     = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get(    "/plan-mappings",     ...adminGuard, adminRateLimiter, listPlanMappingsController);
router.post(   "/plan-mappings",     ...adminGuard, adminRateLimiter, createPlanMappingController);
router.patch(  "/plan-mappings/:id", ...adminGuard, adminRateLimiter, updatePlanMappingController);
router.delete( "/plan-mappings/:id", ...adminGuard, adminRateLimiter, deletePlanMappingController);

export { router as adminPlanMappingsRouter };
