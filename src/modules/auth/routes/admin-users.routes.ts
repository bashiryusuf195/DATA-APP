// src/modules/auth/routes/admin-users.routes.ts
// Mount in app.ts: app.use("/admin", adminUsersRouter)
//
// Routes:
//   GET /admin/users      — paginated list with search + filter
//   GET /admin/users/:id  — full user detail

import { Router } from "express";
import { authenticate }    from "../middleware/authenticate";
import { requireRole }     from "../middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listUsersController,
  getUserController,
} from "../controllers/admin-users.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/users",    ...adminGuard, adminRateLimiter, listUsersController);
router.get("/users/:id", ...adminGuard, adminRateLimiter, getUserController);

export { router as adminUsersRouter };
