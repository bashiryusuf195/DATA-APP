// src/middleware/rbac.ts
//
// Role-Based Access Control middleware.
// Must be used AFTER the `authenticate` middleware (it needs req.user).
//
// Usage examples:
//   router.post('/admin/services',
//     authenticate,
//     requirePermission('services:write'),
//     adminController.createService,
//   );
//
//   router.get('/admin/users',
//     authenticate,
//     requireAdmin,
//     adminController.listUsers,
//   );

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';

// ── Require a specific permission ─────────────────────────────────────────────
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!req.user.permissions.includes(permission)) {
      return next(new ForbiddenError(permission));
    }
    next();
  };
}

// ── Require at least one of several permissions ───────────────────────────────
export function requireAnyPermission(permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    const hasAny = permissions.some(p => req.user!.permissions.includes(p));
    if (!hasAny) {
      return next(new ForbiddenError(permissions.join(' | ')));
    }
    next();
  };
}

// ── Require admin or superadmin role ─────────────────────────────────────────
export function requireAdmin(
  req:  Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    return next(new UnauthorizedError());
  }
  const isAdmin = req.user.roles.some((r: string) => r === 'admin' || r === 'superadmin');
  if (!isAdmin) {
    return next(new ForbiddenError('admin role'));
  }
  next();
}
