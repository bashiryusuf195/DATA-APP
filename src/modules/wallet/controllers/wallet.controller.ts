import type { Request, Response, NextFunction } from "express";

import {
  getUserWalletBalance,
  getUserWalletLedger,
} from "../services/wallet-api.service";

/**
 * GET /wallet/balance
 */
export async function getBalanceController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await getUserWalletBalance(req.user!.id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /wallet/ledger
 */
export async function getLedgerController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = Number(req.query.limit ?? 20);

    const result = await getUserWalletLedger(
      req.user!.id,
      limit
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}