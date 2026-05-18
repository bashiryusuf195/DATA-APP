import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { adminRateLimiter } from "../../../middleware/rateLimiter.redis";
import {
  listWebhookEventsController,
  webhookDiagnosticsController,
} from "../controllers/admin-webhook.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

// Specific route registered BEFORE the paginated list so it is never
// shadowed by a hypothetical future /:id wildcard.
router.get("/webhook-events/diagnostics", ...adminGuard, adminRateLimiter, webhookDiagnosticsController);
router.get("/webhook-events",             ...adminGuard, adminRateLimiter, listWebhookEventsController);

export { router as adminWebhookRouter };
