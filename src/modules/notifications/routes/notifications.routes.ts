import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { balanceRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listNotificationsController,
  markNotificationReadController,
} from "../controllers/notifications.controller";
import {
  getPreferencesController,
  updatePreferencesController,
} from "../controllers/notification-preferences.controller";
import {
  registerPushTokenController,
  deregisterPushTokenController,
  getPushStatusController,
} from "../controllers/push-token.controller";

const router = Router();

// Specific paths must come before parameterised /:id routes.
router.get(   "/preferences", authenticate, balanceRateLimiter, getPreferencesController);
router.patch( "/preferences", authenticate, balanceRateLimiter, updatePreferencesController);

// Push token management
router.post(  "/push-token",  authenticate, balanceRateLimiter, registerPushTokenController);
router.delete("/push-token",  authenticate, balanceRateLimiter, deregisterPushTokenController);
router.get(   "/push-status", authenticate, balanceRateLimiter, getPushStatusController);

router.get(   "/",         authenticate, balanceRateLimiter, listNotificationsController);
router.patch( "/:id/read", authenticate, balanceRateLimiter, markNotificationReadController);

export { router as notificationsRouter };
