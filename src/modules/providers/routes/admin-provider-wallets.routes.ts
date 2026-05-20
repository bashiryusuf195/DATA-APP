import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listProviderWalletsController,
  getProviderWalletController,
  updateProviderWalletController,
  checkBalanceController,
  manualBalanceUpdateController,
} from "../controllers/admin-provider-wallets.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

// List all providers with wallet/funding info
router.get(  "/provider-wallets",                                          ...adminGuard, adminRateLimiter, listProviderWalletsController);
// Get single provider wallet detail
router.get(  "/provider-wallets/:providerCode",                            ...adminGuard, adminRateLimiter, getProviderWalletController);
// Update funding account details and/or low balance threshold
router.patch("/provider-wallets/:providerCode",                            ...adminGuard, adminRateLimiter, updateProviderWalletController);
// Trigger live balance check via provider API
router.post( "/provider-wallets/:providerCode/check-balance",              ...adminGuard, adminRateLimiter, checkBalanceController);
// Record a manual balance observation (when provider has no balance API)
router.post( "/provider-wallets/:providerCode/manual-balance-update",      ...adminGuard, adminRateLimiter, manualBalanceUpdateController);

export { router as adminProviderWalletsRouter };
