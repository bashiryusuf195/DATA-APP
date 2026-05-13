"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
exports.requireAnyPermission = requireAnyPermission;
exports.requireAdmin = requireAdmin;
const errors_1 = require("../lib/errors");
// ── Require a specific permission ─────────────────────────────────────────────
function requirePermission(permission) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new errors_1.UnauthorizedError());
        }
        if (!req.user.permissions.includes(permission)) {
            return next(new errors_1.ForbiddenError(permission));
        }
        next();
    };
}
// ── Require at least one of several permissions ───────────────────────────────
function requireAnyPermission(permissions) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new errors_1.UnauthorizedError());
        }
        const hasAny = permissions.some(p => req.user.permissions.includes(p));
        if (!hasAny) {
            return next(new errors_1.ForbiddenError(permissions.join(' | ')));
        }
        next();
    };
}
// ── Require admin or superadmin role ─────────────────────────────────────────
function requireAdmin(req, _res, next) {
    if (!req.user) {
        return next(new errors_1.UnauthorizedError());
    }
    const isAdmin = req.user.roles.some((r) => r === 'admin' || r === 'superadmin');
    if (!isAdmin) {
        return next(new errors_1.ForbiddenError('admin role'));
    }
    next();
}
//# sourceMappingURL=rbac.js.map