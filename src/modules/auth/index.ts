// src/modules/auth/index.ts
// Barrel export for the auth module.
// Other modules import from here, not from deep paths.

export { authRouter }         from "./routes/auth.routes";
export { authenticate, optionalAuth } from "./middleware/authenticate";
export {
  requireRole,
  requirePermission,
  requireOwnerOrAdmin,
}                             from "./middleware/authorize";
export { validate, validateOrThrow, validateQuery } from "./middleware/validate";
export { generalLimiter }     from "./middleware/rateLimiter";
export { requestContext }     from "./middleware/requestContext";
export { auditLogger }        from "./middleware/auditLogger";
export { writeAuditLog }      from "./services/audit.service";
export {
  resolveUserRbac,
  hasRole,
  hasPermission,
  assignRole,
}                             from "./services/rbac.service";
export type {
  AuthUser,
  AuthUserWithProfile,
  AccessTokenPayload,
  TokenPair,
  RbacContext,
  Session,
}                             from "./types";
