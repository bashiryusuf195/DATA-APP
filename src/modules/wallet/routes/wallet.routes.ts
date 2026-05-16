import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";
import { balanceRateLimiter } from "../../../middleware/rateLimiter.redis";

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

/**
 * Protected wallet routes
 */
router.get(
  "/balance",
  authenticate,
  balanceRateLimiter,
  getBalanceController
);

router.get(
  "/ledger",
  authenticate,
  getLedgerController
);
router.post(
  "/fund/initialize",
  authenticate,
  initializeFundingController
);
router.post(
  "/fund/verify/:reference",
  authenticate,
  verifyFundingController
);
router.post(
  "/fund-test",
  authenticate,
  fundTestController
);
router.post(
  "/transfer",
  authenticate,
  transferController
);
export { router as walletRouter };