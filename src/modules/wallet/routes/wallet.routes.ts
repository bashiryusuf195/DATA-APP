import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import {
  balanceRateLimiter,
  fundingRateLimiter,
  purchaseRateLimiter,
} from "../../../middleware/rateLimiter.redis";
import { requirePin } from "../../../middleware/requirePin";
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
import { getDedicatedAccountController } from "../controllers/dva.controller";
import { getSquadAccountController } from "../controllers/squad-dva.controller";

const router = Router();

router.get("/balance",        authenticate, balanceRateLimiter, getBalanceController);
router.get("/ledger",         authenticate, balanceRateLimiter, getLedgerController);
router.get("/account",        authenticate, balanceRateLimiter, getDedicatedAccountController);
router.get("/squad-account",  authenticate, balanceRateLimiter, getSquadAccountController);

router.post("/fund/initialize",       authenticate, fundingRateLimiter, idempotency, initializeFundingController);
router.post("/fund/verify/:reference", authenticate, fundingRateLimiter, verifyFundingController);

router.post("/fund-test", authenticate, fundTestController);
router.post("/transfer",  authenticate, purchaseRateLimiter, requirePin, transferController);

export { router as walletRouter };