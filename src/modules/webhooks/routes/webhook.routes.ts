import { Router } from "express";
import { webhookRateLimiter } from "../../../middleware/rateLimiter.redis";
import { receiveWebhookController } from "../controllers/webhook.controller";

const router = Router();

// No authentication — provider webhooks arrive without user tokens.
// Payload is always stored; signature_valid flag records trust level.
router.post("/providers/:providerCode", webhookRateLimiter, receiveWebhookController);

export { router as webhookRouter };
