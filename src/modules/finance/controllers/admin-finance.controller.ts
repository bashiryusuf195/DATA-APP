import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getRevenueSummary,
  getProviderBalances,
  getProfitAnalysis,
  listRefunds,
  listReversals,
} from "../services/finance.service";
import { reverseTransaction, refundTransaction } from "../services/reversal.service";
import { AppError } from "../../../shared/errors/AppError";

const DateRangeSchema = z.object({
  from:  z.string().optional(),
  to:    z.string().optional(),
});

const PaginationSchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  search: z.string().optional(),
});

const ReversalBodySchema = z.object({
  reason: z.string().min(3, "Reason must be at least 3 characters").max(500),
});

// ── Finance summary endpoints ─────────────────────────────────────────────────

export async function revenueSummaryController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { from, to } = DateRangeSchema.parse(req.query);
    const data = await getRevenueSummary(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function providerBalancesController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { from, to } = DateRangeSchema.parse(req.query);
    const data = await getProviderBalances(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function profitAnalysisController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { from, to } = DateRangeSchema.parse(req.query);
    const data = await getProfitAnalysis(from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ── Refund / reversal list endpoints ─────────────────────────────────────────

export async function listRefundsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = PaginationSchema.parse(req.query);
    const result = await listRefunds(q);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function listReversalsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = PaginationSchema.parse(req.query);
    const result = await listReversals(q);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── Reversal action ───────────────────────────────────────────────────────────

export async function reverseTransactionController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError(400, "INVALID_PARAMS", "Transaction id required");

    const { reason } = ReversalBodySchema.parse(req.body);
    const admin = req.user as { id?: string; email?: string } | undefined;

    const reversal = await reverseTransaction(
      id,
      reason,
      admin?.id ?? null,
      admin?.email ?? "admin",
    );

    res.status(201).json({ success: true, data: reversal });
  } catch (err) {
    next(err);
  }
}

// ── Refund action ─────────────────────────────────────────────────────────────

export async function refundTransactionController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError(400, "INVALID_PARAMS", "Transaction id required");

    const { reason } = ReversalBodySchema.parse(req.body);
    const admin = req.user as { id?: string; email?: string } | undefined;

    const refund = await refundTransaction(
      id,
      reason,
      admin?.id ?? null,
      admin?.email ?? "admin",
    );

    res.status(201).json({ success: true, data: refund });
  } catch (err) {
    next(err);
  }
}
