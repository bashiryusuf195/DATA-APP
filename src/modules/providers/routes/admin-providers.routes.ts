import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listProvidersController,
  getProviderController,
  upsertCredentialsController,
  healthCheckController,
  credentialDiagnosticController,
  createProviderController,
  updateProviderController,
  disableProviderController,
  fetchProviderPlansController,
  getVtpassVariationsController,
} from "../controllers/admin-providers.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

// List all providers with credential status
router.get(   "/providers",                             ...adminGuard, adminRateLimiter, listProvidersController);
// Create a new provider config row
router.post(  "/providers",                             ...adminGuard, adminRateLimiter, createProviderController);
// Single provider with credential status
router.get(   "/providers/:providerCode",               ...adminGuard, adminRateLimiter, getProviderController);
// Update provider config fields (activate/deactivate, priority, services, etc.)
router.patch( "/providers/:providerCode",               ...adminGuard, adminRateLimiter, updateProviderController);
// Soft-disable a provider (sets is_active = false)
router.delete("/providers/:providerCode",               ...adminGuard, adminRateLimiter, disableProviderController);
// Upsert credentials for a provider (secrets accepted, never returned)
router.patch( "/providers/:providerCode/credentials",   ...adminGuard, adminRateLimiter, upsertCredentialsController);
// Run live health check against a provider
router.post(  "/providers/:providerCode/health-check",          ...adminGuard, adminRateLimiter, healthCheckController);
// Clubkonnect credential diagnostic: loads creds, calls balance endpoint, returns validity
router.post(  "/providers/:providerCode/credential-diagnostic", ...adminGuard, adminRateLimiter, credentialDiagnosticController);
// Fetch available plans for any provider (?service=data|cable_tv &network=mtn|airtel|glo|9mobile)
router.get(   "/providers/:providerCode/plans",                 ...adminGuard, adminRateLimiter, fetchProviderPlansController);
// Fetch VTPass service catalog (?serviceID=mtn-data|dstv|ikeja-electric|…)
router.get(   "/providers/vtpass/service-variations",           ...adminGuard, adminRateLimiter, getVtpassVariationsController);

export { router as adminProvidersRouter };
