import { Router } from "express";
import { authenticate }        from "../../auth/middleware/authenticate";
import { requireRole }         from "../../auth/middleware/authorize";
import { requirePermission }   from "../../auth/middleware/authorize";
import { adminRateLimiter }    from "../../../middleware/rateLimiter.redis";
import {
  adminWalletCreditController,
  adminWalletDebitController,
} from "../controllers/admin-wallet-ops.controller";

const router = Router();

const adminGuard = [
  authenticate,
  requireRole("admin", "super_admin"),
  requirePermission("wallet:execute"),
] as const;

router.post("/wallet/credit", ...adminGuard, adminRateLimiter, adminWalletCreditController);
router.post("/wallet/debit",  ...adminGuard, adminRateLimiter, adminWalletDebitController);

export { router as adminWalletOpsRouter };
