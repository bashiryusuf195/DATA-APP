import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { providerRegistry } from "../../providers/services/provider-registry.service";
import { HttpVTUProvider } from "../../providers/services/http-vtu.provider";
import { updateTransactionStatus } from "../../transactions/services/transaction.service";
import { createNotification } from "../../notifications/services/notification.service";
import { WalletService } from "../../../services/wallet/WalletService";
import { logger } from "../../../lib/logger";

const db = getDbInstance();

type Severity = "low" | "medium" | "high" | "critical";

interface IssueRow {
  id: string;
  report_id: string;
  transaction_reference: string | null;
  issue_type: string;
  severity: Severity;
  description: string;
  metadata: string;
  resolved: boolean;
  created_at: Date;
}

// ── Report lifecycle ──────────────────────────────────────────────────────────

export async function createReconciliationReport(
  reportType: string,
  triggeredBy: "scheduler" | "manual"
): Promise<string> {
  const [row] = await db("reconciliation_reports")
    .insert({
      id:          randomUUID(),
      report_type: reportType,
      started_at:  new Date(),
      status:      "running",
      metadata:    JSON.stringify({ triggered_by: triggeredBy }),
    })
    .returning("id");
  return row.id as string;
}

// ── Main reconciliation runner ────────────────────────────────────────────────

export async function runReconciliation(reportId: string): Promise<void> {
  const issues: Omit<IssueRow, "id" | "created_at" | "resolved">[] = [];

  try {
    // Count the full population being checked for each category.
    const [cntPending, cntSuccessful, cntFailed, cntWallets] = await Promise.all([
      db("transactions").where("status", "pending").count<[{ n: string }]>("id as n"),
      db("transactions").where("status", "successful").count<[{ n: string }]>("id as n"),
      db("transactions").where("status", "failed").count<[{ n: string }]>("id as n"),
      db("wallets").count<[{ n: string }]>("id as n"),
    ]);

    const totalChecked =
      Number(cntPending[0]?.n  ?? 0) +
      Number(cntSuccessful[0]?.n ?? 0) +
      Number(cntFailed[0]?.n   ?? 0) +
      Number(cntWallets[0]?.n  ?? 0);

    // ── A. Pending > 10 minutes ───────────────────────────────────────────────
    const stalePending = await db("transactions")
      .where("status", "pending")
      .where("created_at", "<", db.raw("NOW() - INTERVAL '10 minutes'"))
      .select("reference", "created_at");

    for (const txn of stalePending) {
      const ageMs      = Date.now() - new Date(txn.created_at as string).getTime();
      const ageMinutes = ageMs / 60000;
      const severity: Severity =
        ageMinutes > 120 ? "critical" : ageMinutes > 30 ? "high" : "medium";

      issues.push({
        report_id:             reportId,
        transaction_reference: txn.reference as string,
        issue_type:            "pending_too_long",
        severity,
        description:           `Transaction ${txn.reference} has been pending for ${Math.round(ageMinutes)} minutes`,
        metadata:              JSON.stringify({
          age_minutes: Math.round(ageMinutes),
          created_at:  txn.created_at,
        }),
      });
    }

    // ── B. Successful with no provider_reference ──────────────────────────────
    const missingProvRef = await db("transactions")
      .where("status", "successful")
      .where(function () {
        this.whereNull("provider_reference").orWhere("provider_reference", "");
      })
      .select("reference");

    for (const txn of missingProvRef) {
      issues.push({
        report_id:             reportId,
        transaction_reference: txn.reference as string,
        issue_type:            "missing_provider_reference",
        severity:              "medium",
        description:           `Successful transaction ${txn.reference} has no provider_reference recorded`,
        metadata:              JSON.stringify({}),
      });
    }

    // ── C. Successful with no processed_at ───────────────────────────────────
    const missingProcessedAt = await db("transactions")
      .where("status", "successful")
      .whereNull("processed_at")
      .select("reference");

    for (const txn of missingProcessedAt) {
      issues.push({
        report_id:             reportId,
        transaction_reference: txn.reference as string,
        issue_type:            "successful_no_processed_at",
        severity:              "low",
        description:           `Successful transaction ${txn.reference} is missing processed_at timestamp`,
        metadata:              JSON.stringify({}),
      });
    }

    // ── D. Failed with no refund metadata ────────────────────────────────────
    const failedNoRefund = await db("transactions")
      .where("status", "failed")
      .whereRaw("(metadata->>'refund') IS NULL")
      .select("reference");

    for (const txn of failedNoRefund) {
      issues.push({
        report_id:             reportId,
        transaction_reference: txn.reference as string,
        issue_type:            "failed_no_refund_metadata",
        severity:              "medium",
        description:           `Failed transaction ${txn.reference} has no refund metadata — user may not have been refunded`,
        metadata:              JSON.stringify({}),
      });
    }

    // ── E. Wallet running_balance snapshot vs computed SUM ────────────────────
    // The running_balance stored on the most recent ledger entry is computed at
    // insert time as: SUM(prior signed_amounts) + this entry's signed_amount.
    // It must therefore equal the total SUM(signed_amount) for that wallet.
    // Any discrepancy indicates ledger tampering or a bug in running_balance
    // computation and is treated as a critical integrity failure.
    const balanceMismatches = await db.raw<{
      rows: Array<{
        wallet_id:         string;
        user_id:           string | null;
        computed_balance:  string;
        snapshot_balance:  string | null;
      }>;
    }>(`
      WITH latest_snapshot AS (
        SELECT DISTINCT ON (wallet_id)
          wallet_id,
          running_balance
        FROM wallet_ledger
        ORDER BY wallet_id, created_at DESC
      ),
      ledger_totals AS (
        SELECT wallet_id, COALESCE(SUM(signed_amount), 0) AS computed_balance
        FROM wallet_ledger
        GROUP BY wallet_id
      )
      SELECT
        w.id                                  AS wallet_id,
        w.user_id,
        COALESCE(lt.computed_balance, 0)      AS computed_balance,
        ls.running_balance                    AS snapshot_balance
      FROM wallets w
      LEFT JOIN ledger_totals    lt ON lt.wallet_id = w.id
      LEFT JOIN latest_snapshot  ls ON ls.wallet_id = w.id
      WHERE ABS(
        COALESCE(lt.computed_balance, 0) -
        COALESCE(ls.running_balance,  0)
      ) > 0.001
    `);

    for (const row of balanceMismatches.rows) {
      const computed  = parseFloat(row.computed_balance);
      const snapshot  = row.snapshot_balance != null ? parseFloat(row.snapshot_balance) : 0;
      const diff      = Math.abs(computed - snapshot);

      issues.push({
        report_id:             reportId,
        transaction_reference: null,
        issue_type:            "wallet_balance_mismatch",
        severity:              "critical",
        description:           `Wallet ${row.wallet_id} running_balance snapshot (${snapshot.toFixed(2)}) differs from computed SUM (${computed.toFixed(2)}) by ${diff.toFixed(2)}`,
        metadata:              JSON.stringify({
          wallet_id:        row.wallet_id,
          user_id:          row.user_id,
          computed_balance: computed,
          snapshot_balance: snapshot,
          difference:       diff,
        }),
      });
    }

    // Batch-insert all detected issues
    if (issues.length > 0) {
      const now = new Date();
      await db("reconciliation_issues").insert(
        issues.map((issue) => ({
          id:         randomUUID(),
          ...issue,
          resolved:   false,
          created_at: now,
        }))
      );
    }

    // Mark report completed
    await db("reconciliation_reports")
      .where({ id: reportId })
      .update({
        status:        "completed",
        completed_at:  new Date(),
        total_checked: totalChecked,
        total_issues:  issues.length,
      });
  } catch (err) {
    await db("reconciliation_reports")
      .where({ id: reportId })
      .update({
        status:       "failed",
        completed_at: new Date(),
        metadata:     db.raw(
          "metadata || ?::jsonb",
          [JSON.stringify({ error: err instanceof Error ? err.message : String(err) })]
        ),
      });
    throw err;
  }
}

// ── Repair helpers ────────────────────────────────────────────────────────────

// Clears stale failure fields and marks nested execution block as repaired.
// Must be called after updateTransactionStatus succeeds (not dry-run).
async function clearRepairStaleFields(reference: string, finalProviderCode: string): Promise<void> {
  await db("transactions")
    .where("reference", reference)
    .update({
      failure_reason: null,
      metadata: db.raw(
        `COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('execution', COALESCE(metadata->'execution', '{}'::jsonb) || ?::jsonb)`,
        [JSON.stringify({
          all_failed:     false,
          failure_reason: null,
          failure_stage:  null,
          final_provider: finalProviderCode,
          repaired:       true,
          repaired_at:    new Date().toISOString(),
        })]
      ),
    });
}

// ── Provider-success repair ───────────────────────────────────────────────────
//
// Finds Clubkonnect transactions marked "failed" where the provider_attempts
// raw response contains a success indicator (statuscode="200" or
// status="ORDER_COMPLETED"), then re-verifies each one via the provider API.
// If the provider confirms ORDER_COMPLETED the transaction is flipped to
// "successful" and a success notification is sent.
//
// NOTE: The wallet refund that was issued at failure time is NOT automatically
// reversed.  A manual wallet correction is required for the affected user.
// The repair result includes a `wallet_correction_required` flag for each
// repaired transaction so that an admin can handle it.

export interface RepairCandidate {
  reference:   string;
  user_id:     string;
  service_type: string;
  amount:      string;
  provider_code: string;
}

export interface RepairResult {
  reference:                string;
  provider_code:            string;
  provider_status:          string;
  action:                   "repaired" | "metadata_updated" | "skipped" | "error";
  wallet_correction_required: boolean;
  message:                  string;
}

// Manual-override repair: when the provider's query API is unavailable (e.g.
// Clubkonnect APIQueryV1 returns AUTHENTICATION_FAILED_1 but the transaction is
// confirmed via the Clubkonnect dashboard/receipt), an admin can supply the
// token and OrderID directly from the receipt to finalize the repair without
// an API round-trip.
export interface ManualRepairOverride {
  provider_order_id?: string;   // Clubkonnect TransactionID from receipt
  token?:             string;   // Meter token from receipt
  units?:             string | number;
  customer_name?:     string;
  meter_number?:      string;
  address?:           string;
}

export async function repairProviderSuccess(options: {
  reference?:     string;
  provider_code?: string;
  dry_run?:       boolean;
  manual?:        ManualRepairOverride;
}): Promise<{ repaired: number; skipped: number; errors: number; results: RepairResult[] }> {
  const { reference, provider_code = "clubkonnect", dry_run = false, manual } = options;

  // ── Manual token override path ────────────────────────────────────────────────
  // When the admin supplies the token directly (from a provider receipt), skip the
  // provider API verification entirely.  A specific reference is required.
  if (manual?.token) {
    if (!reference) {
      return {
        repaired: 0, skipped: 0, errors: 1,
        results: [{
          reference:                  "unknown",
          provider_code,
          provider_status:            "error",
          action:                     "error",
          wallet_correction_required: false,
          message:                    "manual token override requires a specific reference",
        }],
      };
    }

    const txn = await db("transactions")
      .where("reference", reference)
      .whereIn("status", ["failed", "successful", "processing"])
      .first();

    if (!txn) {
      return {
        repaired: 0, skipped: 1, errors: 0,
        results: [{
          reference,
          provider_code,
          provider_status:            "not_found",
          action:                     "skipped",
          wallet_correction_required: false,
          message:                    `Transaction ${reference} not found or not in a repairable status (failed/successful/processing)`,
        }],
      };
    }

    const wasAlreadySuccessful = (txn.status as string) === "successful";

    const providerResponse = {
      token:             manual.token,
      units:             manual.units,
      customer_name:     manual.customer_name,
      meter_number:      manual.meter_number ?? (txn.metadata as Record<string, unknown> | null)?.meter_number,
      address:           manual.address,
      provider_order_id: manual.provider_order_id,
    };

    logger.info("reconciliation_repair_manual_override", {
      reference,
      original_status:   txn.status,
      provider_order_id: manual.provider_order_id ?? null,
      token_present:     true,
      dry_run,
    });

    if (!dry_run) {
      await updateTransactionStatus(reference, {
        status:             "successful",
        failure_reason:     null,
        provider:           provider_code,
        provider_reference: manual.provider_order_id ?? (txn.provider_reference as string | null) ?? reference,
        metadata: {
          repair_reason:     "Manual override — token supplied from provider receipt by admin",
          provider_response: providerResponse,
        },
      });
      await clearRepairStaleFields(reference, provider_code);

      // Only notify if the transaction was not already successful — avoid duplicate success messages.
      if (!wasAlreadySuccessful) {
        createNotification({
          user_id:          txn.user_id as string,
          channel:          "in_app",
          type:             "purchase_successful",
          title:            "Transaction Successful",
          message:          `Your ${txn.type as string} purchase was successful.`,
          notification_key: `purchase_successful:${reference}`,
          metadata: {
            reference,
            type:     txn.type,
            amount:   Number(txn.amount),
            provider: provider_code,
            repaired: true,
          },
        }).catch((err: Error) =>
          logger.warn("reconciliation_repair_notification_failed", {
            reference,
            error: err.message,
          })
        );
      }
    }

    if (wasAlreadySuccessful) {
      return {
        repaired: 0,
        skipped:  0,
        errors:   0,
        results: [{
          reference,
          provider_code,
          provider_status:            "successful",
          action:                     dry_run ? "skipped" : "metadata_updated",
          wallet_correction_required: false,
          message: dry_run
            ? `DRY RUN — would update metadata for already-successful transaction with token ${manual.token.slice(0, 6)}... and OrderID ${manual.provider_order_id ?? "(none)"}`
            : `Metadata updated (token, execution fields). Transaction was already successful — no notification sent, no wallet correction needed.`,
        }],
      };
    }

    return {
      repaired: dry_run ? 0 : 1,
      skipped:  0,
      errors:   0,
      results: [{
        reference,
        provider_code,
        provider_status:            "successful",
        action:                     dry_run ? "skipped" : "repaired",
        wallet_correction_required: true,
        message: dry_run
          ? `DRY RUN — would apply manual override with token ${manual.token.slice(0, 6)}... and OrderID ${manual.provider_order_id ?? "(none)"}`
          : `Marked successful via manual override. Wallet correction required (refund was issued).`,
      }],
    };
  }

  // Find failed transactions with a provider_attempt that looks successful
  let candidates: RepairCandidate[] = await db("transactions as t")
    .join("provider_attempts as pa", "pa.transaction_reference", "t.reference")
    .where("t.status", "failed")
    .where("pa.provider_code", provider_code)
    .where("pa.success", false)
    .where(function () {
      this
        .whereRaw("pa.response_payload->>'statuscode' = '200'")
        .orWhereRaw("UPPER(pa.response_payload->>'status') = 'ORDER_COMPLETED'")
        .orWhereRaw("UPPER(pa.response_payload->>'orderstatus') = 'ORDER_COMPLETED'")
        .orWhereRaw("UPPER(pa.response_payload->>'remark') LIKE '%TRANSACTION SUCCESSFUL%'")
        .orWhereRaw("UPPER(pa.response_payload->>'orderremark') LIKE '%TRANSACTION SUCCESSFUL%'")
        // TXN_HISTORY = provider recorded the transaction; token is in the query
        // endpoint not the purchase response, so do not require it here.
        .orWhereRaw("UPPER(pa.response_payload->>'status') = 'TXN_HISTORY'");
    })
    .modify((q) => {
      if (reference) q.where("t.reference", reference);
    })
    .distinct(
      "t.reference",
      "t.user_id",
      db.raw("t.type as service_type"),
      "t.amount",
      db.raw("? AS provider_code", [provider_code]),
    );

  // When a specific reference is supplied but the SQL conditions didn't match
  // (e.g. the stored response_payload is minimal), fall back to a direct
  // transaction lookup so that an explicit targeted repair always proceeds to
  // provider verification rather than silently returning empty results.
  if (reference && candidates.length === 0) {
    const txn = await db("transactions")
      .where("reference", reference)
      .where("status", "failed")
      .first();

    if (txn) {
      logger.info("reconciliation_repair_direct_fallback", {
        reference,
        reason: "No SQL candidate matched — using direct transaction lookup for explicit reference",
      });
      candidates = [{
        reference:     txn.reference as string,
        user_id:       txn.user_id as string,
        service_type:  txn.type as string,
        amount:        txn.amount as string,
        provider_code,
      }];
    }
  }

  logger.info("reconciliation_repair_candidates", {
    count:          candidates.length,
    provider_code,
    dry_run,
    reference:      reference ?? "all",
  });

  let provider;
  try {
    provider = providerRegistry.getProvider(provider_code);
  } catch {
    provider = new HttpVTUProvider(provider_code);
  }

  const results: RepairResult[] = [];
  let repaired = 0, skipped = 0, errors = 0;

  for (const candidate of candidates) {
    try {
      if (typeof provider.verifyTransaction !== "function") {
        results.push({
          reference:                  candidate.reference,
          provider_code,
          provider_status:            "unknown",
          action:                     "skipped",
          wallet_correction_required: false,
          message:                    `${provider_code} does not support transaction verification`,
        });
        skipped++;
        continue;
      }

      // Prefer stored provider_reference (OrderID) over app reference (RequestID) because
      // some providers' query endpoints only accept their own order ID.
      // Fall back to app reference if provider_reference is absent or identical.
      const txnRow = await db("transactions")
        .where("reference", candidate.reference)
        .first("provider_reference");
      const storedOrderId = txnRow?.provider_reference as string | null | undefined;
      const verifyId = (storedOrderId && storedOrderId !== candidate.reference)
        ? storedOrderId
        : candidate.reference;

      logger.info("reconciliation_repair_verify_id", {
        reference:       candidate.reference,
        stored_order_id: storedOrderId ?? null,
        verify_id:       verifyId,
      });

      const verify = await provider.verifyTransaction(verifyId);

      if (verify.status !== "successful") {
        results.push({
          reference:                  candidate.reference,
          provider_code,
          provider_status:            verify.status,
          action:                     "skipped",
          wallet_correction_required: false,
          message:                    `Provider returned ${verify.status}: ${verify.message}`,
        });
        skipped++;
        continue;
      }

      if (!dry_run) {
        // Extract electricity token data from TXN_HISTORY raw response so UI can display it
        const raw = verify.raw_response as Record<string, unknown> | null | undefined;
        const providerResponse = raw?.token
          ? {
              token:           raw.token,
              units:           raw.units,
              customer_name:   raw.customer_name,
              meter_number:    raw.meter_number,
              address:         raw.address,
              electriccompany: raw.electriccompany,
            }
          : undefined;

        await updateTransactionStatus(candidate.reference, {
          status:             "successful",
          failure_reason:     null,
          provider:           provider_code,
          provider_reference: verify.provider_reference ?? candidate.reference,
          metadata: {
            repair_reason:   "Provider confirmed successful; was incorrectly marked failed",
            provider_verify: raw ?? null,
            ...(providerResponse ? { provider_response: providerResponse } : {}),
          },
        });
        await clearRepairStaleFields(candidate.reference, provider_code);

        createNotification({
          user_id:          candidate.user_id,
          channel:          "in_app",
          type:             "purchase_successful",
          title:            "Transaction Successful",
          message:          `Your ${candidate.service_type} purchase was successful.`,
          notification_key: `purchase_successful:${candidate.reference}`,
          metadata: {
            reference:  candidate.reference,
            type:       candidate.service_type,
            amount:     Number(candidate.amount),
            provider:   provider_code,
            repaired:   true,
          },
        }).catch((err: Error) =>
          logger.warn("reconciliation_repair_notification_failed", {
            reference: candidate.reference,
            error:     err.message,
          })
        );
      }

      results.push({
        reference:                  candidate.reference,
        provider_code,
        provider_status:            "successful",
        action:                     "repaired",
        wallet_correction_required: true,
        message:                    dry_run
          ? "DRY RUN — would have been repaired"
          : "Marked successful. Wallet correction required (refund was issued; re-debit user manually).",
      });
      repaired++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("reconciliation_repair_error", { reference: candidate.reference, error: msg });
      results.push({
        reference:                  candidate.reference,
        provider_code,
        provider_status:            "error",
        action:                     "error",
        wallet_correction_required: false,
        message:                    msg,
      });
      errors++;
    }
  }

  logger.info("reconciliation_repair_complete", { repaired, skipped, errors, dry_run });
  return { repaired, skipped, errors, results };
}

// ── Provider query diagnostic ──────────────────────────────────────────────────
//
// Calls the provider's verifyTransaction and returns the raw response so an
// admin can see exactly what the provider returns without triggering a repair.
// Safe to call multiple times — read-only.

export async function testProviderQuery(options: {
  reference:      string;
  provider_code?: string;
}): Promise<{
  verify_id:       string;
  provider_code:   string;
  status:          string;
  message:         string;
  raw_response:    unknown;
  error?:          string;
}> {
  const { reference, provider_code = "clubkonnect" } = options;

  const txnRow = await db("transactions")
    .where("reference", reference)
    .first("reference", "type", "status", "provider_reference");

  const storedOrderId  = txnRow?.provider_reference as string | null | undefined;
  const verifyId = (storedOrderId && storedOrderId !== reference) ? storedOrderId : reference;

  logger.info("reconciliation_test_query", { reference, verify_id: verifyId, provider_code });

  let provider;
  try {
    provider = providerRegistry.getProvider(provider_code);
  } catch {
    provider = new HttpVTUProvider(provider_code);
  }

  if (typeof provider.verifyTransaction !== "function") {
    return {
      verify_id:    verifyId,
      provider_code,
      status:       "error",
      message:      `${provider_code} does not implement verifyTransaction`,
      raw_response: null,
    };
  }

  try {
    const result = await provider.verifyTransaction(verifyId);
    return {
      verify_id:    verifyId,
      provider_code,
      status:       result.status,
      message:      result.message,
      raw_response: result.raw_response ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verify_id:    verifyId,
      provider_code,
      status:       "error",
      message:      msg,
      raw_response: null,
      error:        msg,
    };
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function getReconciliationReports(options: {
  limit:  number;
  offset: number;
}) {
  return db("reconciliation_reports")
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}

export async function getReconciliationIssues(options: {
  limit:        number;
  offset:       number;
  report_id?:   string;
  severity?:    string;
  issue_type?:  string;
  resolved?:    boolean;
}) {
  return db("reconciliation_issues")
    .modify((q) => {
      if (options.report_id  !== undefined) q.where("report_id",  options.report_id);
      if (options.severity   !== undefined) q.where("severity",   options.severity);
      if (options.issue_type !== undefined) q.where("issue_type", options.issue_type);
      if (options.resolved   !== undefined) q.where("resolved",   options.resolved);
    })
    .orderBy("created_at", "desc")
    .limit(options.limit)
    .offset(options.offset);
}

// ── Automated provider reconciliation ─────────────────────────────────────────
//
// Scans for stale transactions, queries the provider that handled each one,
// and repairs or refunds based on the authoritative provider response.
//
// Safety design:
//   - metadata->>'reconciliation_status' guards against reprocessing
//   - idempotency_key `${ref}_refund` prevents double-refund at the wallet layer
//   - notification_key deduplication prevents duplicate customer messages
//   - An in-process Set prevents the same reference being processed twice
//     in a single scan pass (guards against duplicate DB rows)
//   - We never downgrade a `successful` transaction to any other status

export interface ProviderReconciliationResult {
  total_checked:          number;
  repaired_successful:    number;
  refunded_failed:        number;
  still_pending:          number;
  provider_query_failed:  number;
  errors:                 number;
}

export async function runProviderReconciliation(): Promise<ProviderReconciliationResult> {
  const walletService = new WalletService(db);
  const result: ProviderReconciliationResult = {
    total_checked: 0, repaired_successful: 0, refunded_failed: 0,
    still_pending: 0, provider_query_failed: 0, errors: 0,
  };

  logger.info("reconciliation_scan_started");

  // ── Candidate query ─────────────────────────────────────────────────────────
  // 1. pending/processing older than 2 minutes (not yet finalised)
  // 2. recently failed where a refund might not yet have been issued
  // In both cases, cap at 10 reconciliation_attempts and skip already-repaired.
  const candidates = await db("transactions")
    .where(function () {
      this.where(function () {
        this.whereIn("status", ["pending", "processing"])
            .whereRaw("created_at < NOW() - INTERVAL '2 minutes'")
            .whereRaw("created_at > NOW() - INTERVAL '48 hours'");
      }).orWhere(function () {
        this.where("status", "failed")
            .whereNotNull("provider")
            .whereRaw("created_at > NOW() - INTERVAL '24 hours'")
            .whereRaw("COALESCE(metadata->>'refund_processed','false') != 'true'");
      });
    })
    .whereRaw("COALESCE((metadata->>'reconciliation_attempts')::int, 0) < 10")
    .whereRaw("COALESCE(metadata->>'reconciliation_status','') NOT IN ('repaired','refunded')")
    .select("*")
    .orderBy("created_at", "asc")
    .limit(50);

  result.total_checked = candidates.length;

  if (candidates.length === 0) {
    logger.info("reconciliation_scan_started", { total_candidates: 0 });
    return result;
  }

  logger.info("reconciliation_scan_started", { total_candidates: candidates.length });

  const processed = new Set<string>();

  for (const txn of candidates) {
    const reference = txn.reference as string;
    if (processed.has(reference)) continue;
    processed.add(reference);

    try {
      logger.info("reconciliation_candidate_found", {
        reference,
        status:     txn.status,
        created_at: txn.created_at,
        provider:   txn.provider ?? null,
      });

      await reconcileSingleTransaction(txn, result, walletService);
    } catch (err) {
      result.errors++;
      logger.error("reconciliation_error", {
        reference,
        error: (err as Error).message,
      });
      // Stamp attempt so we don't hammer a broken transaction forever
      await db("transactions").where({ reference }).update({
        metadata:   db.raw("COALESCE(metadata,'{}')::jsonb || ?::jsonb", [
          JSON.stringify({
            reconciliation_attempts:  ((txn.metadata as Record<string,unknown>)?.reconciliation_attempts as number ?? 0) + 1,
            last_reconciled_at:       new Date().toISOString(),
            reconciliation_notes:     `Error: ${(err as Error).message}`,
          }),
        ]),
        updated_at: new Date(),
      }).catch(() => { /* non-critical */ });
    }
  }

  logger.info("reconciliation_scan_started", {
    summary: result,
  });

  return result;
}

async function reconcileSingleTransaction(
  txn:           Record<string, unknown>,
  result:        ProviderReconciliationResult,
  walletService: WalletService,
): Promise<void> {
  const reference    = txn.reference    as string;
  const status       = txn.status       as string;
  const serviceType  = (txn.type        as string) ?? "unknown";
  const userId       = txn.user_id      as string;
  const meta         = (txn.metadata    as Record<string, unknown>) ?? {};
  const attempts     = Number(meta.reconciliation_attempts ?? 0);

  // Determine which provider to query.
  // For pending/processing: check provider_attempts for the most recent attempt.
  // For failed:             use txn.provider if set.
  let providerCode = txn.provider as string | null;

  if (!providerCode) {
    const lastAttempt = await db("provider_attempts")
      .where({ transaction_reference: reference })
      .orderBy("attempt_number", "desc")
      .first("provider_code");
    providerCode = (lastAttempt?.provider_code as string | null) ?? null;
  }

  if (!providerCode) {
    logger.warn("reconciliation_left_pending", {
      reference,
      reason: "no provider code found — cannot query",
    });
    result.still_pending++;
    await stampAttempt(reference, attempts, null, "no_provider");
    return;
  }

  // Resolve provider reference (OrderID) for the query — fall back to app reference
  const storedOrderId = txn.provider_reference as string | null | undefined;
  const verifyId = (storedOrderId && storedOrderId !== reference) ? storedOrderId : reference;

  logger.info("reconciliation_provider_query_started", {
    reference,
    provider:  providerCode,
    verify_id: verifyId,
    status,
  });

  // Fetch provider instance
  let provider;
  try {
    provider = providerRegistry.getProvider(providerCode);
  } catch {
    provider = new HttpVTUProvider(providerCode);
  }

  if (typeof provider.verifyTransaction !== "function") {
    logger.warn("reconciliation_provider_query_response", {
      reference,
      provider: providerCode,
      outcome:  "unsupported — provider has no verifyTransaction",
    });
    result.provider_query_failed++;
    await stampAttempt(reference, attempts, providerCode, "provider_unsupported");
    return;
  }

  let verify: Awaited<ReturnType<NonNullable<typeof provider.verifyTransaction>>>;
  try {
    verify = await provider.verifyTransaction(verifyId);
  } catch (queryErr) {
    logger.warn("reconciliation_provider_query_response", {
      reference,
      provider: providerCode,
      outcome:  "query_error",
      error:    (queryErr as Error).message,
    });
    result.provider_query_failed++;
    await stampAttempt(reference, attempts, providerCode, "query_error");
    return;
  }

  logger.info("reconciliation_provider_query_response", {
    reference,
    provider:        providerCode,
    provider_status: verify.status,
    message:         verify.message,
  });

  // ── Decision ────────────────────────────────────────────────────────────────

  if (verify.status === "successful") {
    // Guard: never downgrade an already-successful transaction
    const live = await db("transactions").where({ reference }).first("status");
    if ((live?.status as string) === "successful") {
      logger.info("reconciliation_repaired_success", {
        reference,
        outcome: "already_successful — skipping",
      });
      await stampAttempt(reference, attempts, providerCode, "repaired");
      return;
    }

    const raw = verify.raw_response as Record<string, unknown> | null | undefined;

    await updateTransactionStatus(reference, {
      status:             "successful",
      failure_reason:     null,
      provider:           providerCode,
      provider_reference: verify.provider_reference ?? verifyId,
      metadata: {
        reconciliation_status:  "repaired",
        reconciliation_notes:   "Provider confirmed success during automated reconciliation",
        last_reconciled_at:     new Date().toISOString(),
        reconciliation_attempts: attempts + 1,
        notification_sent:      true,
        provider_verify:        raw ?? null,
        ...(raw?.token ? {
          provider_response: {
            token:         raw.token,
            units:         raw.units,
            customer_name: raw.customer_name,
            meter_number:  raw.meter_number,
          },
        } : {}),
      },
    });

    createNotification({
      user_id:          userId,
      channel:          "in_app",
      type:             "purchase_successful",
      title:            "Transaction Successful",
      message:          `Your ${serviceType} purchase was successful.`,
      notification_key: `purchase_successful:${reference}`,
      metadata: { reference, type: serviceType, amount: Number(txn.amount), provider: providerCode, reconciled: true },
    }).catch((e: Error) => logger.warn("reconciliation_notification_failed", { reference, error: e.message }));

    result.repaired_successful++;
    logger.info("reconciliation_repaired_success", { reference, provider: providerCode });

  } else if (verify.status === "failed") {
    // For pending/processing: refund and mark failed.
    // For already-failed: issue refund only if not yet done.
    const alreadyRefunded = meta.refund_processed === true || meta.refund_processed === "true";
    const srcId  = txn.source_wallet_id      as string | null;
    const destId = txn.destination_wallet_id as string | null;
    let   refundBatchId: string | null = null;

    if (!alreadyRefunded && srcId && destId) {
      try {
        const refundResult = await walletService.transfer({
          from_wallet_id:  destId,
          to_wallet_id:    srcId,
          amount:          Number(txn.amount),
          currency:        (txn.currency as string) ?? "NGN",
          description:     `Reconciliation refund for ${serviceType} ${reference}`,
          idempotency_key: `${reference}_refund`,
          reference_type:  `${serviceType}_refund`,
          metadata:        { reference, reconciled: true },
        });
        refundBatchId = refundResult.journal_batch_id;
        logger.info("reconciliation_refunded_failed", {
          reference,
          provider:  providerCode,
          batch_id:  refundBatchId,
        });
      } catch (refundErr) {
        logger.error("reconciliation_refunded_failed", {
          reference,
          provider: providerCode,
          outcome:  "refund_error",
          error:    (refundErr as Error).message,
        });
      }
    }

    if (status !== "failed") {
      await updateTransactionStatus(reference, {
        status:         "failed",
        failure_reason: verify.message ?? "Provider confirmed failure during reconciliation",
        provider:       providerCode,
        metadata: {
          reconciliation_status:   "refunded",
          reconciliation_notes:    "Provider confirmed failure during automated reconciliation",
          last_reconciled_at:      new Date().toISOString(),
          reconciliation_attempts: attempts + 1,
          refund_processed:        !alreadyRefunded && !!refundBatchId,
          refund: refundBatchId ? { journal_batch_id: refundBatchId } : null,
        },
      });
    } else {
      await db("transactions").where({ reference }).update({
        metadata: db.raw("COALESCE(metadata,'{}')::jsonb || ?::jsonb", [JSON.stringify({
          reconciliation_status:   "refunded",
          last_reconciled_at:      new Date().toISOString(),
          reconciliation_attempts: attempts + 1,
          refund_processed:        !alreadyRefunded && !!refundBatchId,
          refund: refundBatchId ? { journal_batch_id: refundBatchId } : null,
        })]),
        updated_at: new Date(),
      });
    }

    result.refunded_failed++;

  } else {
    // Provider returned unknown/pending — leave the transaction in its current state
    // but increment attempts so we don't poll forever.
    logger.info("reconciliation_left_pending", {
      reference,
      provider:        providerCode,
      provider_status: verify.status,
    });
    result.still_pending++;
    await stampAttempt(reference, attempts, providerCode, "provider_pending");
  }
}

async function stampAttempt(
  reference:              string,
  previousAttempts:       number,
  providerCode:           string | null,
  reconciliationStatus:   string,
): Promise<void> {
  await db("transactions").where({ reference }).update({
    metadata: db.raw("COALESCE(metadata,'{}')::jsonb || ?::jsonb", [JSON.stringify({
      reconciliation_attempts: previousAttempts + 1,
      last_reconciled_at:      new Date().toISOString(),
      reconciliation_status:   reconciliationStatus,
      ...(providerCode ? { reconciliation_provider: providerCode } : {}),
    })]),
    updated_at: new Date(),
  });
}

// ── Reconciliation stats ──────────────────────────────────────────────────────
//
// Aggregates reconciliation metadata across all transactions for the admin
// stats panel. All counts are derived from metadata JSON — no schema changes.

export interface ReconciliationStats {
  repaired_successful: number;
  refunded_failed:     number;
  still_pending:       number;
  provider_errors:     number;
  total_reconciled:    number;
  last_run_at:         string | null;
}

export async function getReconciliationStats(): Promise<ReconciliationStats> {
  const [rows, lastRun] = await Promise.all([
    db("transactions")
      .whereRaw("metadata->>'reconciliation_status' IS NOT NULL")
      .groupByRaw("metadata->>'reconciliation_status'")
      .select(
        db.raw("metadata->>'reconciliation_status' as recon_status"),
        db.raw("COUNT(*) as cnt"),
      ) as Promise<Array<{ recon_status: string; cnt: string }>>,

    db("transactions")
      .whereRaw("metadata->>'last_reconciled_at' IS NOT NULL")
      .max("updated_at as last_at")
      .first() as Promise<{ last_at: Date | null } | undefined>,
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.recon_status] = Number(row.cnt);
  }

  return {
    repaired_successful: byStatus["repaired"]       ?? 0,
    refunded_failed:     byStatus["refunded"]        ?? 0,
    still_pending:       (byStatus["provider_pending"] ?? 0) + (byStatus["no_provider"] ?? 0),
    provider_errors:     (byStatus["query_error"] ?? 0) + (byStatus["provider_unsupported"] ?? 0),
    total_reconciled:    Object.values(byStatus).reduce((s, n) => s + n, 0),
    last_run_at:         lastRun?.last_at ? new Date(lastRun.last_at).toISOString() : null,
  };
}
