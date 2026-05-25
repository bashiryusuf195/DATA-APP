import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export interface ProviderAttempt {
  id:                    string;
  transaction_reference: string;
  provider_code:         string;
  attempt_number:        number;
  request_payload:       Record<string, unknown>;
  response_payload:      Record<string, unknown>;
  success:               boolean;
  error_message:         string | null;
  error_classification:  string | null;
  latency_ms:            number | null;
  created_at:            Date;
}

export interface RecordAttemptInput {
  transaction_reference: string;
  provider_code:         string;
  attempt_number:        number;
  request_payload:       Record<string, unknown>;
  response_payload:      Record<string, unknown>;
  success:               boolean;
  error_message:         string | null;
  error_classification?: string | null;
  latency_ms:            number | null;
}

// ── Write ──────────────────────────────────────────────────────────────────────

export async function recordProviderAttempt(
  input: RecordAttemptInput
): Promise<ProviderAttempt> {
  const [row] = await db("provider_attempts")
    .insert({
      id:                    randomUUID(),
      transaction_reference: input.transaction_reference,
      provider_code:         input.provider_code,
      attempt_number:        input.attempt_number,
      request_payload:       JSON.stringify(input.request_payload),
      response_payload:      JSON.stringify(input.response_payload),
      success:               input.success,
      error_message:         input.error_message,
      error_classification:  input.error_classification ?? null,
      latency_ms:            input.latency_ms,
      created_at:            new Date(),
    })
    .returning("*");

  return coerce(row);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getAttemptsForReference(
  transactionReference: string
): Promise<ProviderAttempt[]> {
  const rows = await db("provider_attempts")
    .where({ transaction_reference: transactionReference })
    .orderBy("attempt_number", "asc");
  return rows.map(coerce);
}

export async function getSuccessfulAttempt(
  transactionReference: string
): Promise<ProviderAttempt | null> {
  const row = await db("provider_attempts")
    .where({ transaction_reference: transactionReference, success: true })
    .first();
  return row ? coerce(row) : null;
}

export async function getFailedAttemptProviderCodes(
  transactionReference: string
): Promise<string[]> {
  // Exclude PENDING-classified attempts — those are not hard failures and the
  // provider should be retried if the pending verification eventually expires.
  const rows = await db("provider_attempts")
    .where({ transaction_reference: transactionReference, success: false })
    .whereNot("error_classification", "PENDING")
    .select("provider_code");
  return rows.map((r: { provider_code: string }) => r.provider_code);
}

export async function getPendingAttemptForReference(
  transactionReference: string
): Promise<ProviderAttempt | null> {
  const row = await db("provider_attempts")
    .where({ transaction_reference: transactionReference, success: false })
    .where("error_classification", "PENDING")
    .orderBy("attempt_number", "desc")
    .first();
  return row ? coerce(row) : null;
}

export async function listProviderAttempts(options: {
  limit:                  number;
  offset:                 number;
  transaction_reference?: string;
  provider_code?:         string;
  success?:               boolean;
}): Promise<ProviderAttempt[]> {
  const rows = await db("provider_attempts")
    .modify((q) => {
      if (options.transaction_reference) q.where("transaction_reference", options.transaction_reference);
      if (options.provider_code)         q.where("provider_code",         options.provider_code);
      if (options.success !== undefined)  q.where("success",               options.success);
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
  return rows.map(coerce);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function coerce(row: Record<string, unknown>): ProviderAttempt {
  return {
    id:                    row.id as string,
    transaction_reference: row.transaction_reference as string,
    provider_code:         row.provider_code as string,
    attempt_number:        Number(row.attempt_number),
    request_payload:       (row.request_payload as Record<string, unknown>) ?? {},
    response_payload:      (row.response_payload as Record<string, unknown>) ?? {},
    success:               row.success as boolean,
    error_message:         (row.error_message as string | null) ?? null,
    error_classification:  (row.error_classification as string | null) ?? null,
    latency_ms:            row.latency_ms != null ? Number(row.latency_ms) : null,
    created_at:            new Date(row.created_at as string),
  };
}
