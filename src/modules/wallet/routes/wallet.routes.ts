import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import {
  balanceRateLimiter,
  fundingRateLimiter,
  purchaseRateLimiter,
} from "../../../middleware/rateLimiter.redis";
import { idempotency } from "../../idempotency/middleware/idempotency.middleware";

import {
  getBalanceController,
  getLedgerController,
  fundTestController,
  transferController,
} from "../controllers/wallet.controller";
import {
  initializeFundingController,
  verifyFundingController,
} from "../controllers/wallet-funding.controller";

const router = Router();

router.get("/balance",  authenticate, balanceRateLimiter, getBalanceController);
router.get("/ledger",   authenticate, balanceRateLimiter, getLedgerController);

router.post("/fund/initialize",       authenticate, fundingRateLimiter, idempotency, initializeFundingController);
router.post("/fund/verify/:reference", authenticate, fundingRateLimiter, verifyFundingController);

router.post("/fund-test", authenticate, fundTestController);
router.post("/transfer",  authenticate, purchaseRateLimiter, transferController);

export { router as walletRouter };