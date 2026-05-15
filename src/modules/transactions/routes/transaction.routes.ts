import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";

import {
  purchaseAirtimeController,
  purchaseDataController,
  purchaseElectricityController,
  purchaseCableTvController,
  purchaseExamPinController,
  identityVerificationController,
} from "../controllers/purchase.controller";

const router = Router();

router.post("/airtime", authenticate, purchaseAirtimeController);
router.post("/data", authenticate, purchaseDataController);
router.post("/electricity", authenticate, purchaseElectricityController);
router.post("/cable-tv", authenticate, purchaseCableTvController);
router.post("/exam-pin", authenticate, purchaseExamPinController);
router.post("/identity-verification", authenticate, identityVerificationController);

export { router as transactionRouter };
