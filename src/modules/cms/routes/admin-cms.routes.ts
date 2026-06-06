import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listPagesController,
  getPageController,
  upsertPageController,
  createPageController,
  publishPageController,
  deletePageController,
} from "../controllers/admin-cms.controller";

const router     = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get(   "/content",               ...adminGuard, adminRateLimiter, listPagesController);
router.get(   "/content/:slug",         ...adminGuard, adminRateLimiter, getPageController);
router.put(   "/content/:slug",         ...adminGuard, adminRateLimiter, upsertPageController);
router.post(  "/content",               ...adminGuard, adminRateLimiter, createPageController);
router.patch( "/content/:slug/publish", ...adminGuard, adminRateLimiter, publishPageController);
router.delete("/content/:slug",         ...adminGuard, adminRateLimiter, deletePageController);

export { router as adminCmsRouter };
