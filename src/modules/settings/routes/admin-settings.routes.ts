import { Router } from "express";
import { authenticate }     from "../../auth/middleware/authenticate";
import { requireRole }      from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listSettingsController,
  updateSettingController,
  environmentInfoController,
} from "../controllers/settings.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

// environment must be registered before /:key to avoid parameter capture
router.get("/settings/environment", ...adminGuard, adminRateLimiter, environmentInfoController);
router.get("/settings",             ...adminGuard, adminRateLimiter, listSettingsController);
router.patch("/settings/:key",      ...adminGuard, adminRateLimiter, updateSettingController);

export { router as adminSettingsRouter };
