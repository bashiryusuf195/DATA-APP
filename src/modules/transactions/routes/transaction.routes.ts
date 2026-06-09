import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { idempotency } from "../../idempotency/middleware/idempotency.middleware";
import {
  purchaseRateLimiter,
  verificationRateLimiter,
} from "../../../middleware/rateLimiter.redis";
import { duplicatePurchaseGuard } from "../../../middleware/duplicate-purchase.guard";
import { requirePin } from "../../../middleware/requirePin";

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
import { downloadReceiptController } from "../controllers/receipt.controller";

const router = Router();

router.get("/", authenticate, listTransactionsController);

// Specific sub-paths MUST come before the /:reference wildcard
router.get("/identity-verification/:reference/report",
  authenticate,
  identityReportController);

// PDF receipt — works for all transaction types
router.get("/:reference/receipt",
  authenticate,
  downloadReceiptController);

router.get("/:reference", authenticate, getTransactionController);

// ── Purchase endpoints ─────────────────────────────────────────────────────────
// Middleware order per route:
//   1. authenticate    — sets req.user
//   2. purchaseRateLimiter — IP+user volume cap
//   3. idempotency     — replay cached response for same idempotency key
//   4. duplicatePurchaseGuard — 30s dedup for same service/recipient/amount
//   5. controller

// Middleware order for purchase routes:
//   authenticate → purchaseRateLimiter → idempotency (early-return on replay)
//   → requirePin → duplicatePurchaseGuard → controller
// requirePin sits after idempotency so replayed requests skip PIN re-verification.

router.post("/airtime",
  authenticate, purchaseRateLimiter, idempotency,
  requirePin,
  duplicatePurchaseGuard("airtime"),
  purchaseAirtimeController);

router.post("/data",
  authenticate, purchaseRateLimiter, idempotency,
  requirePin,
  duplicatePurchaseGuard("data"),
  purchaseDataController);

// Verify endpoints: read-only lookups — no PIN, no idempotency, stricter rate limit.
router.post("/electricity/verify",
  authenticate, verificationRateLimiter,
  verifyMeterController);

router.post("/electricity",
  authenticate, purchaseRateLimiter, idempotency,
  requirePin,
  duplicatePurchaseGuard("electricity"),
  purchaseElectricityController);

router.post("/cable-tv/verify",
  authenticate, verificationRateLimiter,
  verifyCableController);

router.post("/cable-tv",
  authenticate, purchaseRateLimiter, idempotency,
  requirePin,
  duplicatePurchaseGuard("cable_tv"),
  purchaseCableTvController);

router.post("/exam-pin",
  authenticate, purchaseRateLimiter, idempotency,
  requirePin,
  duplicatePurchaseGuard("exam_pin"),
  purchaseExamPinController);

router.post("/identity-verification",
  authenticate, purchaseRateLimiter, idempotency,
  requirePin,
  identityVerificationController);

export { router as transactionRouter };
