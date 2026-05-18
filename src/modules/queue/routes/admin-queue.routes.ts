import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listFailedJobsController,
  retryFailedJobController,
} from "../controllers/failed-jobs.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get( "/failed-jobs",          ...adminGuard, adminRateLimiter, listFailedJobsController);
router.post("/failed-jobs/:id/retry", ...adminGuard, adminRateLimiter, retryFailedJobController);

export { router as adminQueueRouter };
