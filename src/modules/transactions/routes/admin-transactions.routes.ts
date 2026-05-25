import { Router } from "express";
import { authenticate }      from "../../auth/middleware/authenticate";
import { requireRole }       from "../../auth/middleware/authorize";
import { adminRateLimiter }  from "../../../middleware/rateLimiter.redis";
import {
  listAllTransactionsController,
  retryTransactionController,
} from "../controllers/admin-transactions.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get( "/transactions",                        ...adminGuard, adminRateLimiter, listAllTransactionsController);
router.post("/transactions/:reference/retry",       ...adminGuard, adminRateLimiter, retryTransactionController);

export { router as adminTransactionsRouter };
