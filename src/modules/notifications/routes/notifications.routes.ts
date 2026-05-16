import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import {
  listNotificationsController,
  markNotificationReadController,
} from "../controllers/notifications.controller";

const router = Router();

router.get(  "/",        authenticate, listNotificationsController);
router.patch("/:id/read", authenticate, markNotificationReadController);

export { router as notificationsRouter };
