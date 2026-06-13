import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listAdminNotificationsController,
  sendNotificationController,
  retryNotificationJobController,
  deleteNotificationJobController,
  listNotificationJobsController,
  listTemplatesController,
  createTemplateController,
  updateTemplateController,
  deleteNotificationController,
  getAdminPushPreferencesController,
  updateAdminPushPreferencesController,
  getAdminPushStatusController,
  testAdminPushController,
} from "../controllers/admin-notifications.controller";
import {
  registerPushTokenController,
  deregisterPushTokenController,
} from "../controllers/push-token.controller";

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

// Delete a notification job from the queue
router.delete(
  "/notifications/jobs/:id",
  ...adminGuard, adminRateLimiter,
  deleteNotificationJobController,
);

// Soft-delete a single customer inbox notification (must come after /jobs/:id)
router.delete(
  "/notifications/:id",
  ...adminGuard, adminRateLimiter,
  deleteNotificationController,
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

// ── Admin push preferences & token registration ───────────────────────────────
router.get(  "/admin/push-preferences", ...adminGuard, adminRateLimiter, getAdminPushPreferencesController);
router.put(  "/admin/push-preferences", ...adminGuard, adminRateLimiter, updateAdminPushPreferencesController);
router.get(  "/admin/push-status",      ...adminGuard, adminRateLimiter, getAdminPushStatusController);
router.post( "/admin/push/test",        ...adminGuard, adminRateLimiter, testAdminPushController);
router.post( "/admin/push-token",       ...adminGuard, adminRateLimiter, registerPushTokenController);
router.delete("/admin/push-token",      ...adminGuard, adminRateLimiter, deregisterPushTokenController);

export { router as adminNotificationsRouter };
