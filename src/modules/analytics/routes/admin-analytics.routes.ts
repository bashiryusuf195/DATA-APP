import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import { profitAnalyticsController } from "../controllers/profit-analytics.controller";

const router     = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/analytics/profit", ...adminGuard, adminRateLimiter, profitAnalyticsController);

export { router as adminAnalyticsRouter };
