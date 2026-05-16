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

export async function getWebhookEvents(options: {
  limit: number;
  offset: number;
  provider_code?: string;
}) {
  return db("webhook_events")
    .modify((q) => {
      if (options.provider_code) q.where({ provider_code: options.provider_code });
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}
