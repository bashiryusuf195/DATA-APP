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

const router = Router();

// Specific paths must come before parameterised /:id routes.
router.get(   "/preferences", authenticate, balanceRateLimiter, getPreferencesController);
router.patch( "/preferences", authenticate, balanceRateLimiter, updatePreferencesController);

router.get(   "/",         authenticate, balanceRateLimiter, listNotificationsController);
router.patch( "/:id/read", authenticate, balanceRateLimiter, markNotificationReadController);

export { router as notificationsRouter };
