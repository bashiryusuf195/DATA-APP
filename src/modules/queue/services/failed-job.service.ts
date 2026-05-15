import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export interface RecordFailedJobInput {
  queue_name: string;
  job_name: string;
  reference: string | null;
  payload: Record<string, unknown>;
  error_message: string;
  stack_trace: string | null;
  retry_count: number;
}

export async function recordFailedJob(input: RecordFailedJobInput) {
  await db("failed_jobs").insert({
    id: randomUUID(),
    queue_name: input.queue_name,
    job_name: input.job_name,
    reference: input.reference ?? null,
    payload: input.payload,
    error_message: input.error_message,
    stack_trace: input.stack_trace ?? null,
    retry_count: input.retry_count,
    failed_at: new Date(),
    created_at: new Date(),
  });
}

export async function getFailedJobs(options: {
  limit: number;
  offset: number;
  queue_name?: string;
}) {
  return db("failed_jobs")
    .modify((q) => {
      if (options.queue_name) q.where({ queue_name: options.queue_name });
    })
    .orderBy("failed_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}
