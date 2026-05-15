import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { idempotency } from "../../idempotency/middleware/idempotency.middleware";

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

router.post("/airtime", authenticate, idempotency, purchaseAirtimeController);
router.post("/data", authenticate, idempotency, purchaseDataController);
router.post("/electricity", authenticate, idempotency, purchaseElectricityController);
router.post("/cable-tv", authenticate, idempotency, purchaseCableTvController);
router.post("/exam-pin", authenticate, idempotency, purchaseExamPinController);
router.post("/identity-verification", authenticate, idempotency, identityVerificationController);

export { router as transactionRouter };
