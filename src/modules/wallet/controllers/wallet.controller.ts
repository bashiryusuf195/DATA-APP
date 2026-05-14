import type { Request, Response, NextFunction } from "express";

import {
  getUserWalletBalance,
  getUserWalletLedger,
  fundUserWallet,
  transferBetweenWallets,
} from "../services/wallet-api.service";
import { TransferSchema } from "../validators/wallet.validators";
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
}import { FundTestSchema } from "../validators/wallet.validators";

export async function fundTestController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = FundTestSchema.parse(req.body);

    const result = await fundUserWallet(
      req.user!.id,
      input.amount
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}export async function transferController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = TransferSchema.parse(req.body);

    const result = await transferBetweenWallets(
      req.user!.id,
      input
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}