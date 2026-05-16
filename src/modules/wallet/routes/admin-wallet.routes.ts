import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import { listFundingTransactionsController } from "../controllers/admin-funding.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/funding-transactions", ...adminGuard, adminRateLimiter, listFundingTransactionsController);

export { router as adminWalletRouter };
