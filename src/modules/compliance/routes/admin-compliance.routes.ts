import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listKycUsersController,
  listKycVerificationsController,
  updateKycStatusController,
  listRiskFlagsController,
  createRiskFlagController,
  updateRiskFlagController,
  listComplianceReportsController,
  listBlacklistController,
  addToBlacklistController,
  removeFromBlacklistController,
  freezeAccountController,
  unfreezeAccountController,
  listFrozenAccountsController,
} from "../controllers/compliance.controller";

const router = Router();
const complianceGuard = [authenticate, requireRole("compliance", "admin", "super_admin")] as const;

// ── KYC ───────────────────────────────────────────────────────────────────────
router.get(   "/kyc/users",            ...complianceGuard, adminRateLimiter, listKycUsersController);
router.get(   "/kyc/verifications",    ...complianceGuard, adminRateLimiter, listKycVerificationsController);
router.patch( "/kyc/users/:id/status", ...complianceGuard, adminRateLimiter, updateKycStatusController);

// ── Risk Flags ────────────────────────────────────────────────────────────────
router.get(   "/risk/flags",     ...complianceGuard, adminRateLimiter, listRiskFlagsController);
router.post(  "/risk/flags",     ...complianceGuard, adminRateLimiter, createRiskFlagController);
router.patch( "/risk/flags/:id", ...complianceGuard, adminRateLimiter, updateRiskFlagController);

// ── Compliance Reports ────────────────────────────────────────────────────────
router.get(   "/compliance/reports", ...complianceGuard, adminRateLimiter, listComplianceReportsController);

// ── Blacklist ─────────────────────────────────────────────────────────────────
router.get(    "/blacklist",      ...complianceGuard, adminRateLimiter, listBlacklistController);
router.post(   "/blacklist",      ...complianceGuard, adminRateLimiter, addToBlacklistController);
router.delete( "/blacklist/:id",  ...complianceGuard, adminRateLimiter, removeFromBlacklistController);

// ── Account Freeze / Unfreeze ─────────────────────────────────────────────────
router.post(   "/users/:id/freeze",   ...complianceGuard, adminRateLimiter, freezeAccountController);
router.post(   "/users/:id/unfreeze", ...complianceGuard, adminRateLimiter, unfreezeAccountController);
router.get(    "/frozen-accounts",    ...complianceGuard, adminRateLimiter, listFrozenAccountsController);

export { router as adminComplianceRouter };
