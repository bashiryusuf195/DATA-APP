import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../lib/errors";
import { airtimeQueue }         from "../queues/airtime.queue";
import { vtuPurchaseQueue }     from "../queues/vtu-purchase.queue";
import { paystackWebhookQueue } from "../queues/paystack-webhook.queue";
import type { Queue } from "bullmq";

const db = getDbInstance();

const QUEUE_MAP: Record<string, Queue> = {
  "airtime-purchases": airtimeQueue,
  "vtu-purchases":     vtuPurchaseQueue,
  "paystack-webhooks": paystackWebhookQueue,
};

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

export async function getFailedJobById(id: string) {
  return db("failed_jobs").where({ id }).first();
}

export async function retryFailedJob(id: string): Promise<{ job_id: string | undefined }> {
  const record = await getFailedJobById(id);
  if (!record) {
    throw new AppError("Failed job not found", "NOT_FOUND", 404);
  }

  const queue = QUEUE_MAP[record.queue_name as string];
  if (!queue) {
    throw new AppError(
      `No queue registered for '${record.queue_name as string}'. Cannot retry.`,
      "UNRETRYABLE_QUEUE",
      422,
    );
  }

  const newJob = await queue.add(
    record.job_name as string,
    record.payload as Record<string, unknown>,
  );

  return { job_id: newJob.id };
}
