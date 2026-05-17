import { Router } from "express";
import { authenticate }     from "../../auth/middleware/authenticate";
import { requireRole }      from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import { listFundingTransactionsController } from "../controllers/admin-funding.controller";
import {
  listLedgerController,
  listJournalBatchesController,
  getJournalBatchController,
} from "../controllers/admin-ledger.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/funding-transactions",  ...adminGuard, adminRateLimiter, listFundingTransactionsController);
router.get("/wallet-ledger",         ...adminGuard, adminRateLimiter, listLedgerController);
router.get("/journal-batches",       ...adminGuard, adminRateLimiter, listJournalBatchesController);
router.get("/journal-batches/:id",   ...adminGuard, adminRateLimiter, getJournalBatchController);

export { router as adminWalletRouter };
