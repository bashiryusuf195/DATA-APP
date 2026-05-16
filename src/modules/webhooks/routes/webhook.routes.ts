import { Router } from "express";
import { receiveWebhookController } from "../controllers/webhook.controller";

const router = Router();

// No authentication — provider webhooks arrive without user tokens.
// Payload is always stored; signature_valid flag records trust level.
router.post("/providers/:providerCode", receiveWebhookController);

export { router as webhookRouter };
