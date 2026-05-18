import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listAdminNotificationsController,
  sendNotificationController,
  retryNotificationJobController,
  listNotificationJobsController,
  listTemplatesController,
  createTemplateController,
  updateTemplateController,
} from "../controllers/admin-notifications.controller";

const router = Router();

const adminGuard   = [authenticate, requireRole("admin", "super_admin")] as const;
const financeGuard = [authenticate, requireRole("admin", "super_admin", "finance_admin")] as const;

// Notification log (in-app / user-facing notifications)
router.get(
  "/notifications",
  ...adminGuard, adminRateLimiter,
  listAdminNotificationsController,
);

// Send a notification (targeted or broadcast)
router.post(
  "/notifications/send",
  ...adminGuard, adminRateLimiter,
  sendNotificationController,
);

// Retry a failed notification job — must come before /notification-jobs wildcard
router.post(
  "/notifications/retry/:jobId",
  ...adminGuard, adminRateLimiter,
  retryNotificationJobController,
);

// Notification jobs queue
router.get(
  "/notification-jobs",
  ...adminGuard, adminRateLimiter,
  listNotificationJobsController,
);

// Templates
router.get(
  "/notification-templates",
  ...financeGuard, adminRateLimiter,
  listTemplatesController,
);

router.post(
  "/notification-templates",
  ...adminGuard, adminRateLimiter,
  createTemplateController,
);

router.patch(
  "/notification-templates/:id",
  ...adminGuard, adminRateLimiter,
  updateTemplateController,
);

export { router as adminNotificationsRouter };
