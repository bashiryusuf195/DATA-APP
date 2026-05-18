import { Router } from "express";
import { authenticate }    from "../../auth/middleware/authenticate";
import { requireRole }     from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  revenueSummaryController,
  providerBalancesController,
  profitAnalysisController,
  listRefundsController,
  listReversalsController,
  reverseTransactionController,
  refundTransactionController,
} from "../controllers/admin-finance.controller";

const router     = Router();
const financeGuard = [
  authenticate,
  requireRole("admin", "super_admin", "finance_admin"),
] as const;

// ── Finance analytics ─────────────────────────────────────────────────────────
router.get("/finance/revenue-summary",   ...financeGuard, adminRateLimiter, revenueSummaryController);
router.get("/finance/provider-balances", ...financeGuard, adminRateLimiter, providerBalancesController);
router.get("/finance/profit-analysis",   ...financeGuard, adminRateLimiter, profitAnalysisController);

// ── Refund / reversal lists ───────────────────────────────────────────────────
router.get("/finance/refunds",    ...financeGuard, adminRateLimiter, listRefundsController);
router.get("/finance/reversals",  ...financeGuard, adminRateLimiter, listReversalsController);

// ── Reversal & refund actions on transactions ─────────────────────────────────
router.post("/transactions/:id/reverse", ...financeGuard, adminRateLimiter, reverseTransactionController);
router.post("/transactions/:id/refund",  ...financeGuard, adminRateLimiter, refundTransactionController);

export { router as adminFinanceRouter };
