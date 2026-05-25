import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listFailedJobsController,
  retryFailedJobController,
} from "../controllers/failed-jobs.controller";
import {
  getQueueStatsController,
  getQueueJobsController,
  retryQueueJobController,
  removeQueueJobController,
  clearCompletedController,
} from "../controllers/queue-monitor.controller";

const router = Router();

const adminGuard      = [authenticate, requireRole("admin", "super_admin")] as const;
const superAdminGuard = [authenticate, requireRole("super_admin")]           as const;

// ── Legacy failed-jobs (DB-backed) ────────────────────────────────────────────
router.get( "/failed-jobs",          ...adminGuard, adminRateLimiter, listFailedJobsController);
router.post("/failed-jobs/:id/retry", ...adminGuard, adminRateLimiter, retryFailedJobController);

// ── Live queue monitor (BullMQ / Redis-backed) ────────────────────────────────
router.get(   "/queue-monitor",                                            ...adminGuard,      adminRateLimiter, getQueueStatsController);
router.get(   "/queue-monitor/:queueName/jobs",                            ...adminGuard,      adminRateLimiter, getQueueJobsController);
router.post(  "/queue-monitor/:queueName/jobs/:jobId/retry",               ...adminGuard,      adminRateLimiter, retryQueueJobController);
router.delete("/queue-monitor/:queueName/jobs/:jobId",                     ...adminGuard,      adminRateLimiter, removeQueueJobController);
router.post(  "/queue-monitor/:queueName/clear-completed",                 ...superAdminGuard, adminRateLimiter, clearCompletedController);

export { router as adminQueueRouter };
