import { Queue, Worker, JobsOptions } from "bullmq";
import { redis } from "../../../config/redis";

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export function createQueue(name: string) {
  return new Queue(name, {
    connection: redis,
    defaultJobOptions,
  });
}

export function createWorker(
  name: string,
  processor: ConstructorParameters<typeof Worker>[1]
) {
  return new Worker(name, processor, {
    connection: redis,
    concurrency: 5,
  });
}