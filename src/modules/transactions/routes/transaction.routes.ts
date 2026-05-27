import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { idempotency } from "../../idempotency/middleware/idempotency.middleware";
import {
  purchaseRateLimiter,
  verificationRateLimiter,
} from "../../../middleware/rateLimiter.redis";
import { duplicatePurchaseGuard } from "../../../middleware/duplicate-purchase.guard";

import {
  purchaseAirtimeController,
  purchaseDataController,
  purchaseElectricityController,
  verifyMeterController,
  purchaseCableTvController,
  verifyCableController,
  purchaseExamPinController,
  identityVerificationController,
} from "../controllers/purchase.controller";

import {
  listTransactionsController,
  getTransactionController,
} from "../controllers/transaction-history.controller";
import { identityReportController } from "../controllers/identity-report.controller";

const router = Router();

router.get("/", authenticate, listTransactionsController);
// Specific sub-paths must come BEFORE the /:reference wildcard
router.get("/identity-verification/:reference/report",
  authenticate,
  identityReportController);
router.get("/:reference", authenticate, getTransactionController);

// ── Purchase endpoints ─────────────────────────────────────────────────────────
// Middleware order per route:
//   1. authenticate    — sets req.user
//   2. purchaseRateLimiter — IP+user volume cap
//   3. idempotency     — replay cached response for same idempotency key
//   4. duplicatePurchaseGuard — 30s dedup for same service/recipient/amount
//   5. controller

router.post("/airtime",
  authenticate, purchaseRateLimiter, idempotency,
  duplicatePurchaseGuard("airtime"),
  purchaseAirtimeController);

router.post("/data",
  authenticate, purchaseRateLimiter, idempotency,
  duplicatePurchaseGuard("data"),
  purchaseDataController);

// Verify endpoints: no idempotency (read-only), stricter rate limit, no dedup guard
router.post("/electricity/verify",
  authenticate, verificationRateLimiter,
  verifyMeterController);

router.post("/electricity",
  authenticate, purchaseRateLimiter, idempotency,
  duplicatePurchaseGuard("electricity"),
  purchaseElectricityController);

router.post("/cable-tv/verify",
  authenticate, verificationRateLimiter,
  verifyCableController);

router.post("/cable-tv",
  authenticate, purchaseRateLimiter, idempotency,
  duplicatePurchaseGuard("cable_tv"),
  purchaseCableTvController);

router.post("/exam-pin",
  authenticate, purchaseRateLimiter, idempotency,
  duplicatePurchaseGuard("exam_pin"),
  purchaseExamPinController);

router.post("/identity-verification",
  authenticate, purchaseRateLimiter, idempotency,
  identityVerificationController);

export { router as transactionRouter };
