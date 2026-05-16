import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { listFundingTransactions } from "../services/funding-transaction.service";

const AdminFundingQuerySchema = z.object({
  limit:           z.coerce.number().int().min(1).max(100).default(20),
  offset:          z.coerce.number().int().min(0).default(0),
  user_id:         z.string().uuid().optional(),
  status:          z.enum(["pending", "successful", "failed", "abandoned"]).optional(),
  payment_gateway: z.string().min(1).optional(),
  verified:        z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

// ── GET /admin/funding-transactions ───────────────────────────────────────────

export async function listFundingTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = AdminFundingQuerySchema.parse(req.query);
    const rows  = await listFundingTransactions({
      limit:           query.limit,
      offset:          query.offset,
      user_id:         query.user_id,
      status:          query.status,
      payment_gateway: query.payment_gateway,
      verified:        query.verified,
    });

    res.status(200).json({ success: true, data: rows, meta: { limit: query.limit, offset: query.offset } });
  } catch (err) {
    next(err);
  }
}
