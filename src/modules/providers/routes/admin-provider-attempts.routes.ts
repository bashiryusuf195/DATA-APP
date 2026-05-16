import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import { listProviderAttemptsController } from "../controllers/admin-provider-attempts.controller";

const router = Router();
const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/provider-attempts", ...adminGuard, adminRateLimiter, listProviderAttemptsController);

export { router as adminProviderAttemptsRouter };
