import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listProvidersController,
  getProviderController,
  upsertCredentialsController,
  healthCheckController,
} from "../controllers/admin-providers.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

// List all providers with credential status
router.get(   "/providers",                             ...adminGuard, adminRateLimiter, listProvidersController);
// Single provider with credential status
router.get(   "/providers/:providerCode",               ...adminGuard, adminRateLimiter, getProviderController);
// Upsert credentials for a provider (secrets accepted, never returned)
router.patch( "/providers/:providerCode/credentials",   ...adminGuard, adminRateLimiter, upsertCredentialsController);
// Run live health check against a provider
router.post(  "/providers/:providerCode/health-check",  ...adminGuard, adminRateLimiter, healthCheckController);

export { router as adminProvidersRouter };
