// src/modules/dashboard/routes/admin-dashboard.routes.ts
// Mount in app.ts: app.use("/admin", adminDashboardRouter)
//
// Routes:
//   GET /admin/dashboard/metrics  — authoritative platform-wide aggregates

import { Router }             from "express";
import { authenticate }       from "../../auth/middleware/authenticate";
import { requireRole }        from "../../auth/middleware/authorize";
import { adminRateLimiter }   from "../../../middleware/rateLimiter.redis";
import { dashboardMetricsController } from "../controllers/dashboard.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/dashboard/metrics", ...adminGuard, adminRateLimiter, dashboardMetricsController);

export { router as adminDashboardRouter };
