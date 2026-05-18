import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export interface StoreWebhookInput {
  provider_code: string;
  event_type: string | null;
  provider_reference: string | null;
  transaction_reference: string | null;
  payload: Record<string, unknown>;
  headers: Record<string, unknown>;
  signature_valid: boolean;
}

export async function storeWebhookEvent(input: StoreWebhookInput) {
  const [record] = await db("webhook_events")
    .insert({
      id: randomUUID(),
      provider_code: input.provider_code,
      event_type: input.event_type,
      provider_reference: input.provider_reference,
      transaction_reference: input.transaction_reference,
      payload: input.payload,
      headers: input.headers,
      signature_valid: input.signature_valid,
      processed: false,
      processed_at: null,
      created_at: new Date(),
    })
    .returning("*");

  return record as { id: string } & Record<string, unknown>;
}

export async function markWebhookProcessed(id: string): Promise<void> {
  await db("webhook_events").where({ id }).update({
    processed: true,
    processed_at: new Date(),
  });
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export interface WebhookDiagnosticsData {
  webhook_url_path:       string;
  total_events:           number;
  total_today:            number;
  processed_today:        number;
  invalid_sig_today:      number;
  last_event:             Record<string, unknown> | null;
  last_invalid_signature: Record<string, unknown> | null;
  last_processing_error: {
    error_message: string;
    failed_at:     string;
    reference:     string | null;
  } | null;
}

export async function getWebhookDiagnostics(): Promise<WebhookDiagnosticsData> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalResult,
    todayResult,
    processedTodayResult,
    invalidSigTodayResult,
    lastEvent,
    lastInvalidSig,
    lastFailedJob,
  ] = await Promise.all([
    db("webhook_events")
      .where({ provider_code: "paystack" })
      .count("id as count")
      .first() as Promise<{ count: string } | undefined>,
    db("webhook_events")
      .where({ provider_code: "paystack" })
      .where("created_at", ">=", todayStart)
      .count("id as count")
      .first() as Promise<{ count: string } | undefined>,
    db("webhook_events")
      .where({ provider_code: "paystack", processed: true })
      .where("created_at", ">=", todayStart)
      .count("id as count")
      .first() as Promise<{ count: string } | undefined>,
    db("webhook_events")
      .where({ provider_code: "paystack", signature_valid: false })
      .where("created_at", ">=", todayStart)
      .count("id as count")
      .first() as Promise<{ count: string } | undefined>,
    db("webhook_events")
      .where({ provider_code: "paystack" })
      .orderBy("created_at", "desc")
      .first() as Promise<Record<string, unknown> | undefined>,
    db("webhook_events")
      .where({ provider_code: "paystack", signature_valid: false })
      .orderBy("created_at", "desc")
      .first() as Promise<Record<string, unknown> | undefined>,
    db("failed_jobs")
      .where({ queue_name: "paystack-webhooks" })
      .orderBy("failed_at", "desc")
      .first() as Promise<Record<string, unknown> | undefined>,
  ]);

  return {
    webhook_url_path:       "/webhooks/paystack",
    total_events:           Number(totalResult?.count           ?? 0),
    total_today:            Number(todayResult?.count           ?? 0),
    processed_today:        Number(processedTodayResult?.count  ?? 0),
    invalid_sig_today:      Number(invalidSigTodayResult?.count ?? 0),
    last_event:             lastEvent      ?? null,
    last_invalid_signature: lastInvalidSig ?? null,
    last_processing_error:  lastFailedJob
      ? {
          error_message: lastFailedJob.error_message as string,
          failed_at:     lastFailedJob.failed_at     as string,
          reference:     (lastFailedJob.reference    as string | null) ?? null,
        }
      : null,
  };
}

export async function getWebhookEvents(options: {
  limit: number;
  offset: number;
  provider_code?: string;
  event_type?: string;
}) {
  return db("webhook_events")
    .modify((q) => {
      if (options.provider_code) q.where({ provider_code: options.provider_code });
      if (options.event_type)    q.where({ event_type: options.event_type });
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}
