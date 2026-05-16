import { createQueue } from "../config/queue.config";

export const paystackWebhookQueue = createQueue("paystack-webhooks");
