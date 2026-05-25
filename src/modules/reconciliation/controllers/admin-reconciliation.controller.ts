import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getReconciliationReports,
  getReconciliationIssues,
  getReconciliationStats,
  repairProviderSuccess,
  testProviderQuery,
} from "../services/reconciliation.service";
import { reconciliationQueue } from "../workers/reconciliation.worker";
import { defaultJobOptions } from "../../queue/config/queue.config";
import type { ReconciliationJobPayload } from "../jobs/reconciliation.job";

const PaginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const IssuesQuerySchema = PaginationSchema.extend({
  report_id:  z.string().uuid().optional(),
  severity:   z.enum(["low", "medium", "high", "critical"]).optional(),
  issue_type: z.string().min(1).optional(),
  resolved:   z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export async function listReportsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query   = PaginationSchema.parse(req.query);
    const reports = await getReconciliationReports(query);

    res.status(200).json({
      success: true,
      data:    reports,
      meta:    { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}

export async function listIssuesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query  = IssuesQuerySchema.parse(req.query);
    const issues = await getReconciliationIssues(query);

    res.status(200).json({
      success: true,
      data:    issues,
      meta:    { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/reconciliation/repair-provider-success ────────────────────────
//
// Finds Clubkonnect transactions marked "failed" where the provider response
// indicates success and re-verifies / repairs them.
//
// Body params:
//   reference          — target a single transaction reference (required for manual mode)
//   provider_code      — defaults to "clubkonnect"
//   dry_run            — true to scan without writing (default false)
//   provider_order_id  — Clubkonnect TransactionID from receipt (manual override)
//   token              — Meter token from receipt (triggers manual override path)
//   units              — Electricity units from receipt
//   customer_name      — Customer name from receipt
//   meter_number       — Meter number from receipt

const RepairSchema = z.object({
  reference:         z.string().min(1).optional(),
  provider_code:     z.string().min(1).optional(),
  dry_run:           z.boolean().optional(),
  // Manual override fields — when token is supplied the provider API is not called
  provider_order_id: z.string().min(1).optional(),
  token:             z.string().min(1).optional(),
  units:             z.union([z.string(), z.number()]).optional(),
  customer_name:     z.string().min(1).optional(),
  meter_number:      z.string().min(1).optional(),
  address:           z.string().min(1).optional(),
});

export async function repairProviderSuccessController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input  = RepairSchema.parse(req.body);
    const result = await repairProviderSuccess({
      reference:     input.reference,
      provider_code: input.provider_code,
      dry_run:       input.dry_run,
      manual: input.token ? {
        provider_order_id: input.provider_order_id,
        token:             input.token,
        units:             input.units,
        customer_name:     input.customer_name,
        meter_number:      input.meter_number,
        address:           input.address,
      } : undefined,
    });

    res.status(200).json({
      success: true,
      data:    result,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/reconciliation/test-provider-query ─────────────────────────────
//
// Diagnostic: calls the provider's verifyTransaction for a given reference and
// returns the raw response.  Read-only, safe to call repeatedly.
//
// Query params:
//   reference     — transaction reference to query
//   provider_code — defaults to "clubkonnect"

export async function testProviderQueryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schema = z.object({
      reference:     z.string().min(1),
      provider_code: z.string().min(1).optional(),
    });
    const { reference, provider_code } = schema.parse(req.query);
    const result = await testProviderQuery({ reference, provider_code });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function triggerReconciliationController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const job = await reconciliationQueue.add(
      "manual_reconciliation",
      {
        report_type:  "full_reconciliation",
        triggered_by: "manual",
      } satisfies ReconciliationJobPayload,
      { ...defaultJobOptions }
    );

    res.status(202).json({
      success: true,
      message: "Reconciliation job enqueued",
      job_id:  job.id,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/reconciliation/stats ───────────────────────────────────────────

export async function getStatsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getReconciliationStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}
