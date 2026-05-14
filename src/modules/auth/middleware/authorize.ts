// src/modules/auth/middleware/authorize.ts
// requireRole() and requirePermission() middleware factories.
// Must be used AFTER authenticate() — relies on req.user.

import type { Request, Response, NextFunction } from "express";
import { hasRole, hasPermission } from "../services/rbac.service";
import { AppError } from "../../../shared/errors/AppError";

/**
 * Gate: user must hold at least one of the listed role slugs (OR logic).
 *
 * @example
 *   router.get("/admin/users", authenticate, requireRole("admin", "super_admin"), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }
    if (!hasRole(req.user.roles, allowedRoles)) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          `Requires one of the following roles: ${allowedRoles.join(", ")}`
        )
      );
    }
    next();
  };
}

/**
 * Gate: user must hold the specified permission string (resource:action).
 * Supports wildcard: users with "*:*" (super_admin) always pass.
 *
 * @example
 *   router.post("/wallets/credit", authenticate, requirePermission("wallet:create"), handler)
 */
export function requirePermission(permission: string) {
  return function permissionGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }
    if (!hasPermission(req.user.permissions, permission)) {
      return next(
        new AppError(403, "FORBIDDEN", `Missing required permission: ${permission}`)
      );
    }
    next();
  };
}

/**
 * Gate: user must be the resource owner OR hold admin/super_admin.
 * Compares req.params[paramName] to req.user.id.
 *
 * @param paramName - route param containing the owner's user id (default "userId")
 */
export function requireOwnerOrAdmin(paramName = "userId") {
  return function ownerOrAdminGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }
    const isOwner = req.params[paramName] === req.user.id;
    const isAdmin = hasRole(req.user.roles, ["admin", "super_admin"]);
    if (!isOwner && !isAdmin) {
      return next(new AppError(403, "FORBIDDEN", "Access denied"));
    }
    next();
  };
}
