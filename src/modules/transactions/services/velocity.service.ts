import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { logger } from "../../../lib/logger";

const db = getDbInstance();

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  // 5+ failed purchases within 5 minutes → suspicious_volume / high
  failedPurchases: { count: 5, windowMin: 5, severity: "high" as const, flagType: "suspicious_volume" as const },
  // 5+ distinct recipient identifiers within 10 minutes → suspicious_volume / high
  uniqueRecipients: { count: 5, windowMin: 10, severity: "high" as const, flagType: "suspicious_volume" as const },
  // 3+ provider validation failures within 2 minutes → fraud_suspected / medium
  validationFails:  { count: 3, windowMin: 2,  severity: "medium" as const, flagType: "fraud_suspected" as const },
  // 5+ wallet funding initializations within 60 minutes → duplicate_funding / medium
  fundingAttempts:  { count: 5, windowMin: 60, severity: "medium" as const, flagType: "duplicate_funding" as const },
};

// ── Internal flag writer ──────────────────────────────────────────────────────
// Inserts a system-generated risk flag without requiring an admin actor.
// Skips creation if a matching open flag already exists within 24 hours to
// avoid spamming. The `flagged_by = null` and `source = 'system'` combination
// identifies these as automated flags in the admin UI.

async function createSystemFlag(input: {
  user_id:        string;
  flag_type:      string;
  severity:       string;
  title:          string;
  description:    string;
  evidence:       Record<string, unknown>;
  transaction_ref?: string;
}): Promise<void> {
  const existing = await db("risk_flags")
    .where({
      user_id:   input.user_id,
      flag_type: input.flag_type,
      status:    "open",
    })
    .whereRaw("created_at > NOW() - INTERVAL '24 hours'")
    .first();

  if (existing) return;

  const id = randomUUID();
  await db("risk_flags").insert({
    id,
    user_id:         input.user_id,
    flag_type:       input.flag_type,
    severity:        input.severity,
    status:          "open",
    title:           input.title,
    description:     input.description,
    evidence:        JSON.stringify(input.evidence),
    transaction_ref: input.transaction_ref ?? null,
    flagged_by:      null,
    source:          "system",
    created_at:      new Date(),
    updated_at:      new Date(),
  });

  logger.warn("suspicious_activity_flagged", {
    flag_id:    id,
    user_id:    input.user_id,
    flag_type:  input.flag_type,
    severity:   input.severity,
    title:      input.title,
  });
}

// ── Purchase velocity ─────────────────────────────────────────────────────────
// Called as fire-and-forget after each purchase initialization.
// Does NOT block the purchase — only flags for admin review.

export async function checkPurchaseVelocity(
  userId: string,
  meta: {
    serviceType:  string;
    reference?:   string;
  },
): Promise<void> {
  await Promise.allSettled([
    checkFailedPurchases(userId, meta.reference),
    checkUniqueRecipients(userId, meta.reference),
    checkValidationFailures(userId, meta.reference),
  ]);
}

// ── Funding velocity ──────────────────────────────────────────────────────────

export async function checkFundingVelocity(
  userId:    string,
  reference?: string,
): Promise<void> {
  await Promise.allSettled([checkFundingAttempts(userId, reference)]);
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkFailedPurchases(
  userId:    string,
  reference?: string,
): Promise<void> {
  const { count, windowMin, severity, flagType } = THRESHOLDS.failedPurchases;

  const [row] = await db("transactions")
    .where({ user_id: userId, status: "failed" })
    .whereRaw(`created_at > NOW() - INTERVAL '${windowMin} minutes'`)
    .count<[{ cnt: string }]>("id as cnt");

  const cnt = parseInt(row.cnt, 10);
  if (cnt < count) return;

  await createSystemFlag({
    user_id:         userId,
    flag_type:       flagType,
    severity,
    title:           `High failed purchase rate — ${cnt} failures in ${windowMin} min`,
    description:     `User accumulated ${cnt} failed transactions within ${windowMin} minutes (threshold: ${count}).`,
    evidence:        { failed_count: cnt, window_minutes: windowMin, threshold: count },
    transaction_ref: reference,
  });
}

async function checkUniqueRecipients(
  userId:    string,
  reference?: string,
): Promise<void> {
  const { count, windowMin, severity, flagType } = THRESHOLDS.uniqueRecipients;

  // Count distinct recipients (phone / meter_number) across all purchase types.
  const result = await db.raw<{ rows: Array<{ cnt: string }> }>(`
    SELECT COUNT(DISTINCT COALESCE(
      NULLIF(metadata->>'phone',         ''),
      NULLIF(metadata->>'meter_number',  ''),
      NULLIF(metadata->>'iuc_number',    ''),
      NULLIF(metadata->>'smartcard_number', '')
    )) AS cnt
    FROM transactions
    WHERE user_id = ?
      AND type IN ('airtime','data','electricity','cable_tv')
      AND created_at > NOW() - INTERVAL '${windowMin} minutes'
  `, [userId]);

  const cnt = parseInt(result.rows[0]?.cnt ?? "0", 10);
  if (cnt < count) return;

  await createSystemFlag({
    user_id:         userId,
    flag_type:       flagType,
    severity,
    title:           `Unusual recipient spread — ${cnt} distinct recipients in ${windowMin} min`,
    description:     `User purchased to ${cnt} different recipient identifiers within ${windowMin} minutes (threshold: ${count}). Possible reseller or fraud pattern.`,
    evidence:        { unique_recipients: cnt, window_minutes: windowMin, threshold: count },
    transaction_ref: reference,
  });
}

async function checkValidationFailures(
  userId:    string,
  reference?: string,
): Promise<void> {
  const { count, windowMin, severity, flagType } = THRESHOLDS.validationFails;

  const [row] = await db("transactions")
    .where({ user_id: userId, status: "failed" })
    .whereRaw(`created_at > NOW() - INTERVAL '${windowMin} minutes'`)
    .whereRaw(`
      (failure_reason ILIKE '%validation%'
       OR failure_reason ILIKE '%invalid%'
       OR failure_reason ILIKE '%invalid meter%'
       OR failure_reason ILIKE '%invalid phone%'
       OR failure_reason ILIKE '%not found%')
    `)
    .count<[{ cnt: string }]>("id as cnt");

  const cnt = parseInt(row.cnt, 10);
  if (cnt < count) return;

  await createSystemFlag({
    user_id:         userId,
    flag_type:       flagType,
    severity,
    title:           `Repeated provider validation failures — ${cnt} in ${windowMin} min`,
    description:     `User triggered ${cnt} provider validation failures within ${windowMin} minutes (threshold: ${count}). Possible data probe or testing.`,
    evidence:        { validation_failures: cnt, window_minutes: windowMin, threshold: count },
    transaction_ref: reference,
  });
}

async function checkFundingAttempts(
  userId:    string,
  reference?: string,
): Promise<void> {
  const { count, windowMin, severity, flagType } = THRESHOLDS.fundingAttempts;

  const [row] = await db("funding_transactions")
    .where({ user_id: userId })
    .whereRaw(`created_at > NOW() - INTERVAL '${windowMin} minutes'`)
    .count<[{ cnt: string }]>("id as cnt");

  const cnt = parseInt(row.cnt, 10);
  if (cnt < count) return;

  await createSystemFlag({
    user_id:         userId,
    flag_type:       flagType,
    severity,
    title:           `High wallet funding frequency — ${cnt} attempts in ${windowMin} min`,
    description:     `User initiated ${cnt} wallet funding attempts within ${windowMin} minutes (threshold: ${count}).`,
    evidence:        { funding_attempts: cnt, window_minutes: windowMin, threshold: count },
    transaction_ref: reference,
  });
}
