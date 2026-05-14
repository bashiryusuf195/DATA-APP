import { Job } from "bullmq";

import { createWorker } from "../config/queue.config";

import type { AirtimeJobPayload } from "../jobs/airtime.job";

export const airtimeWorker =
  createWorker(
    "airtime-purchases",

    async (job) => {
  const data = job.data as AirtimeJobPayload;
      console.log(
        "[AIRTIME WORKER] Processing:",
        data
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      console.log(
        "[AIRTIME WORKER] Completed:",
        data.reference
      );
    }
  );

airtimeWorker.on(
  "failed",
  (job, err) => {
    console.error(
      "[AIRTIME WORKER FAILED]",
      job?.id,
      err
    );
  }
);