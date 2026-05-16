import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
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
router.get(   "/preferences", authenticate, getPreferencesController);
router.patch( "/preferences", authenticate, updatePreferencesController);

router.get(   "/",        authenticate, listNotificationsController);
router.patch( "/:id/read", authenticate, markNotificationReadController);

export { router as notificationsRouter };
