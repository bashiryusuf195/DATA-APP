import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../../shared/errors/AppError";
import {
  getUserTransactions,
  getTransactionByReferenceForUser,
} from "../services/transaction.service";

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum(["pending", "processing", "successful", "failed", "reversed", "cancelled"])
    .optional(),
  type: z
    .enum([
      "wallet_funding",
      "wallet_transfer",
      "airtime",
      "data",
      "electricity",
      "cable_tv",
      "exam_pin",
      "identity_verification",
    ])
    .optional(),
});

export async function listTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = ListQuerySchema.parse(req.query);

    const transactions = await getUserTransactions(req.user!.id, query);

    res.status(200).json({
      success: true,
      data: transactions,
      meta: {
        limit: query.limit,
        offset: query.offset,
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
