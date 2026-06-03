import { Router } from "express";
import { webhookRateLimiter } from "../../../middleware/rateLimiter.redis";
import { receiveWebhookController } from "../controllers/webhook.controller";
import { paystackWebhookController } from "../controllers/paystack-webhook.controller";
import { squadWebhookController } from "../controllers/squad-webhook.controller";

const router = Router();

// Paystack webhook — signature verified inside controller using req.rawBody
// Must be registered before the generic :providerCode route.
router.post("/paystack", webhookRateLimiter, paystackWebhookController);

// Squad webhook — signature verified via x-squad-encrypted-body (HMAC-SHA512)
router.post("/squad", webhookRateLimiter, squadWebhookController);

// Generic provider webhook (mock_vtu_provider, etc.)
router.post("/providers/:providerCode", webhookRateLimiter, receiveWebhookController);

export { router as webhookRouter };
