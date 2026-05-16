import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getReconciliationReports,
  getReconciliationIssues,
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

export async function triggerReconciliationController(
  req: Request,
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
