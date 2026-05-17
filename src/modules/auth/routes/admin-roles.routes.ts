// src/modules/auth/routes/admin-roles.routes.ts
// Mount in app.ts: app.use("/admin", adminRolesRouter)
//
// Routes:
//   GET    /admin/roles                      — list all roles with permission + user counts
//   GET    /admin/permissions                — list all permissions grouped by resource
//   GET    /admin/users/:id/roles            — list roles assigned to a user
//   POST   /admin/users/:id/roles            — assign a role to a user
//   DELETE /admin/users/:id/roles/:roleId    — revoke a role from a user

import { Router } from "express";
import { authenticate }     from "../middleware/authenticate";
import { requireRole }      from "../middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listRolesController,
  listPermissionsController,
  getUserRolesController,
  assignRoleController,
  revokeRoleController,
} from "../controllers/admin-roles.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/roles",                       ...adminGuard, adminRateLimiter, listRolesController);
router.get("/permissions",                 ...adminGuard, adminRateLimiter, listPermissionsController);
router.get("/users/:id/roles",             ...adminGuard, adminRateLimiter, getUserRolesController);
router.post("/users/:id/roles",            ...adminGuard, adminRateLimiter, assignRoleController);
router.delete("/users/:id/roles/:roleId",  ...adminGuard, adminRateLimiter, revokeRoleController);

export { router as adminRolesRouter };
