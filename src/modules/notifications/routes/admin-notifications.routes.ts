import { Router } from "express";
import { authenticate }  from "../../auth/middleware/authenticate";
import { requireRole }   from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import { listAdminNotificationsController } from "../controllers/admin-notifications.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/notifications", ...adminGuard, adminRateLimiter, listAdminNotificationsController);

export { router as adminNotificationsRouter };
