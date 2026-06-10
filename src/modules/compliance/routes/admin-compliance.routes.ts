import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter, adminSensitiveLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listKycUsersController,
  listKycVerificationsController,
  updateKycStatusController,
  reviewIdentityVerificationController,
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
router.get(   "/kyc/users",            ...complianceGuard, adminRateLimiter,      listKycUsersController);
router.get(   "/kyc/verifications",    ...complianceGuard, adminRateLimiter,      listKycVerificationsController);
router.patch( "/kyc/users/:id/status",          ...complianceGuard, adminSensitiveLimiter, updateKycStatusController);
router.patch( "/kyc/users/:id/verify-identity", ...complianceGuard, adminSensitiveLimiter, reviewIdentityVerificationController);

// ── Risk Flags ────────────────────────────────────────────────────────────────
router.get(   "/risk/flags",     ...complianceGuard, adminRateLimiter,      listRiskFlagsController);
router.post(  "/risk/flags",     ...complianceGuard, adminSensitiveLimiter, createRiskFlagController);
router.patch( "/risk/flags/:id", ...complianceGuard, adminSensitiveLimiter, updateRiskFlagController);

// ── Compliance Reports ────────────────────────────────────────────────────────
router.get(   "/compliance/reports", ...complianceGuard, adminRateLimiter, listComplianceReportsController);

// ── Blacklist ─────────────────────────────────────────────────────────────────
router.get(    "/blacklist",      ...complianceGuard, adminRateLimiter,      listBlacklistController);
router.post(   "/blacklist",      ...complianceGuard, adminSensitiveLimiter, addToBlacklistController);
router.delete( "/blacklist/:id",  ...complianceGuard, adminSensitiveLimiter, removeFromBlacklistController);

// ── Account Freeze / Unfreeze — sensitive: 10 ops per 5 min ───────────────────
router.post(   "/users/:id/freeze",   ...complianceGuard, adminSensitiveLimiter, freezeAccountController);
router.post(   "/users/:id/unfreeze", ...complianceGuard, adminSensitiveLimiter, unfreezeAccountController);
router.get(    "/frozen-accounts",    ...complianceGuard, adminRateLimiter,       listFrozenAccountsController);

export { router as adminComplianceRouter };
