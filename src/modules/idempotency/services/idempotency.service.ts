import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

const TTL_HOURS = 24;

export interface IdempotencyRecord {
  id: string;
  user_id: string;
  idempotency_key: string;
  endpoint: string;
  request_hash: string;
  response_body: Record<string, unknown> | null;
  status_code: number | null;
  created_at: Date;
  expires_at: Date;
}

export async function findActiveKey(
  userId: string,
  key: string
): Promise<IdempotencyRecord | undefined> {
  return db("idempotency_keys")
    .where({ user_id: userId, idempotency_key: key })
    .where("expires_at", ">", db.fn.now())
    .first();
}

export async function createIdempotencyKey(data: {
  user_id: string;
  idempotency_key: string;
  endpoint: string;
  request_hash: string;
}): Promise<IdempotencyRecord> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TTL_HOURS);

  const [record] = await db("idempotency_keys")
    .insert({
      id: randomUUID(),
      user_id: data.user_id,
      idempotency_key: data.idempotency_key,
      endpoint: data.endpoint,
      request_hash: data.request_hash,
      response_body: null,
      status_code: null,
      created_at: new Date(),
      expires_at: expiresAt,
    })
    .returning("*");

  return record as IdempotencyRecord;
}

export async function storeIdempotencyResponse(
  id: string,
  statusCode: number,
  responseBody: unknown
): Promise<void> {
  await db("idempotency_keys").where({ id }).update({
    status_code: statusCode,
    response_body: responseBody,
  });
}
