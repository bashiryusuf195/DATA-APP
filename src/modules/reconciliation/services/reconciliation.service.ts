import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

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
