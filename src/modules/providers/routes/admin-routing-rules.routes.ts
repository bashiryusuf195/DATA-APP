import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listRoutingRulesController,
  createRoutingRuleController,
  updateRoutingRuleController,
} from "../controllers/admin-routing-rules.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get(  "/provider-routing-rules",      ...adminGuard, adminRateLimiter, listRoutingRulesController);
router.post( "/provider-routing-rules",      ...adminGuard, adminRateLimiter, createRoutingRuleController);
router.patch("/provider-routing-rules/:id",  ...adminGuard, adminRateLimiter, updateRoutingRuleController);

export { router as adminRoutingRulesRouter };
