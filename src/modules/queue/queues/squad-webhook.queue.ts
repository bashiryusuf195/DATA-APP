import { createQueue } from "../config/queue.config";

export const squadWebhookQueue = createQueue("squad-webhooks");
