import { Router } from "express";

import { authenticate } from "../../auth/middleware/authenticate";

import {
  getBalanceController,
  getLedgerController,
} from "../controllers/wallet.controller";

const router = Router();

/**
 * Protected wallet routes
 */
router.get(
  "/balance",
  authenticate,
  getBalanceController
);

router.get(
  "/ledger",
  authenticate,
  getLedgerController
);

export { router as walletRouter };