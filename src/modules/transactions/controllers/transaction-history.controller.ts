import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../../shared/errors/AppError";
import {
  getUserTransactions,
  getTransactionByReferenceForUser,
} from "../services/transaction.service";

const ListQuerySchema = z.object({
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  page:      z.coerce.number().int().min(1).default(1),
  status:    z.enum(["pending", "processing", "successful", "failed", "reversed", "cancelled"]).optional(),
  type:      z.enum([
    "wallet_funding", "wallet_transfer",
    "airtime", "data", "electricity",
    "cable_tv", "exam_pin", "identity_verification",
  ]).optional(),
  date_from: z.string().optional(),
  date_to:   z.string().optional(),
  reference: z.string().max(100).optional(),
  search:    z.string().max(100).optional(),
});

export async function listTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query  = ListQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const { rows, total } = await getUserTransactions(req.user!.id, {
      limit:     query.limit,
      offset,
      status:    query.status,
      type:      query.type,
      date_from: query.date_from,
      date_to:   query.date_to,
      reference: query.reference,
      search:    query.search,
    });

    res.status(200).json({
      success: true,
      data:    rows,
      meta: {
        total,
        page:  query.page,
        limit: query.limit,
        pages: Math.ceil(total / query.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getTransactionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const transaction = await getTransactionByReferenceForUser(
      req.params.reference,
      req.user!.id
    );

    if (!transaction) {
      throw new AppError(404, "TRANSACTION_NOT_FOUND", "Transaction not found");
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
}
