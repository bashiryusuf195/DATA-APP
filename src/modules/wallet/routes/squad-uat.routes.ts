import { Router } from "express";
import { authenticate }     from "../../auth/middleware/authenticate";
import { requireRole }      from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  uatCreateIndividualAccountController,
  uatCreateBusinessAccountController,
  uatSimulatePaymentController,
  uatGetCustomerTransactionsController,
  uatGetMerchantTransactionsController,
  uatFetchVAByNumberController,
  uatFetchVAByCustomerController,
} from "../controllers/squad-uat.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

// All routes hit Squad's sandbox environment — no production wallet impact.
// Protected by admin/super_admin role; rate-limited via adminRateLimiter.

// Scenario 1 — Create Individual Virtual Account
router.post("/individual-account",                           ...adminGuard, adminRateLimiter, uatCreateIndividualAccountController);

// Scenario 2 — Create Business Virtual Account
router.post("/business-account",                             ...adminGuard, adminRateLimiter, uatCreateBusinessAccountController);

// Scenario 3 — Simulate Bank Transfer (sandbox only)
router.post("/simulate-payment",                             ...adminGuard, adminRateLimiter, uatSimulatePaymentController);

// Scenario 4 — Customer Virtual Account Transactions
router.get("/customer-transactions/:customerIdentifier",     ...adminGuard, adminRateLimiter, uatGetCustomerTransactionsController);

// Scenario 5 — Merchant Virtual Account Transactions
router.get("/merchant-transactions",                         ...adminGuard, adminRateLimiter, uatGetMerchantTransactionsController);

// Scenario 6 — Retrieve VA by Account Number (NUBAN)
router.get("/account-number/:virtualAccountNumber",          ...adminGuard, adminRateLimiter, uatFetchVAByNumberController);

// Scenario 7 — Retrieve VA by Customer Identifier
router.get("/customer/:customerIdentifier",                  ...adminGuard, adminRateLimiter, uatFetchVAByCustomerController);

export { router as squadUatRouter };
