export * from "./services/queue.service";
export * from "./jobs/airtime.job";

import { config } from '../../config';

// Workers are only started when DISABLE_WORKERS is not set.
// Queue objects (used by API routes for job enqueueing) are always available.
if (!config.workers.disabled) {
  void Promise.all([
    import("./workers/airtime.worker"),
    import("./workers/vtu-purchase.worker"),
    import("./workers/vtu-verify-pending.worker"),
    import("./workers/paystack-webhook.worker"),
    import("../reconciliation/workers/reconciliation.worker"),
    import("../notifications/workers/notification.worker"),
  ]);
}
