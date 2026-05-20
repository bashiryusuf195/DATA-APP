import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import { listGroupSummaryController, setGroupControlController } from "../controllers/admin-availability.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/service-availability/groups",         ...adminGuard, adminRateLimiter, listGroupSummaryController);
router.post("/service-availability/groups/toggle", ...adminGuard, adminRateLimiter, setGroupControlController);

export { router as adminAvailabilityRouter };
