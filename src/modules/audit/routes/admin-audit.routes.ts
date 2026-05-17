// src/modules/audit/routes/admin-audit.routes.ts
// Mount in app.ts: app.use("/admin", adminAuditRouter)
//
// Routes:
//   GET /admin/audit-logs      — paginated list with search + filter
//   GET /admin/audit-logs/:id  — full entry detail

import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listAuditLogsController,
  getAuditLogController,
} from "../controllers/admin-audit.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/audit-logs",      ...adminGuard, adminRateLimiter, listAuditLogsController);
router.get("/audit-logs/:id",  ...adminGuard, adminRateLimiter, getAuditLogController);

export { router as adminAuditRouter };
