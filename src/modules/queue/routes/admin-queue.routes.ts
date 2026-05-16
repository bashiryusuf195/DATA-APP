import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import { listFailedJobsController } from "../controllers/failed-jobs.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/failed-jobs", ...adminGuard, adminRateLimiter, listFailedJobsController);

export { router as adminQueueRouter };
