import { Router } from "express";
import { authenticate }   from "../../auth/middleware/authenticate";
import { requireRole }    from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listAnnouncementsController,
  createAnnouncementController,
  updateAnnouncementController,
  deleteAnnouncementController,
} from "../controllers/admin-announcement.controller";

const router     = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get(   "/announcements",     ...adminGuard, adminRateLimiter, listAnnouncementsController);
router.post(  "/announcements",     ...adminGuard, adminRateLimiter, createAnnouncementController);
router.patch( "/announcements/:id", ...adminGuard, adminRateLimiter, updateAnnouncementController);
router.delete("/announcements/:id", ...adminGuard, adminRateLimiter, deleteAnnouncementController);

export { router as adminAnnouncementRouter };
