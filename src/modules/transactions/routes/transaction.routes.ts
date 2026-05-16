import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { idempotency } from "../../idempotency/middleware/idempotency.middleware";
import { purchaseRateLimiter } from "../../../middleware/rateLimiter.redis";

import {
  purchaseAirtimeController,
  purchaseDataController,
  purchaseElectricityController,
  purchaseCableTvController,
  purchaseExamPinController,
  identityVerificationController,
} from "../controllers/purchase.controller";

import {
  listTransactionsController,
  getTransactionController,
} from "../controllers/transaction-history.controller";

const router = Router();

router.get("/", authenticate, listTransactionsController);
router.get("/:reference", authenticate, getTransactionController);

router.post("/airtime",               authenticate, purchaseRateLimiter, idempotency, purchaseAirtimeController);
router.post("/data",                  authenticate, purchaseRateLimiter, idempotency, purchaseDataController);
router.post("/electricity",           authenticate, purchaseRateLimiter, idempotency, purchaseElectricityController);
router.post("/cable-tv",              authenticate, purchaseRateLimiter, idempotency, purchaseCableTvController);
router.post("/exam-pin",              authenticate, purchaseRateLimiter, idempotency, purchaseExamPinController);
router.post("/identity-verification", authenticate, purchaseRateLimiter, idempotency, identityVerificationController);

export { router as transactionRouter };
