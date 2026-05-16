import { Router } from "express";
import { authenticate } from "../../auth/middleware/authenticate";
import { requireRole } from "../../auth/middleware/authorize";
import { listWebhookEventsController } from "../controllers/admin-webhook.controller";

const router = Router();

const adminGuard = [authenticate, requireRole("admin", "super_admin")] as const;

router.get("/webhook-events", ...adminGuard, listWebhookEventsController);

export { router as adminWebhookRouter };
