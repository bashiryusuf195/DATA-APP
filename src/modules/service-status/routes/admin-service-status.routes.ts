import { Router } from "express";
import { authenticate }     from "../../auth/middleware/authenticate";
import { requireRole }      from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listServiceStatusController,
  updateServiceStatusController,
} from "../controllers/admin-service-status.controller";

const router     = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get(   "/service-status",      ...adminGuard, adminRateLimiter, listServiceStatusController);
router.patch( "/service-status/:key", ...adminGuard, adminRateLimiter, updateServiceStatusController);

export { router as adminServiceStatusRouter };
