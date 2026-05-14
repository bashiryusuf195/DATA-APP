import { queueService } from "../services/queue.service";

import type { AirtimeJobPayload } from "../jobs/airtime.job";

queueService.register(
  "airtime_purchase",
  async (payload: unknown) => {
    const job =
      payload as AirtimeJobPayload;

    console.log(
      "[AIRTIME WORKER] Processing:",
      job
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 2000)
    );

    console.log(
      "[AIRTIME WORKER] Completed:",
      job.reference
    );
  }
);