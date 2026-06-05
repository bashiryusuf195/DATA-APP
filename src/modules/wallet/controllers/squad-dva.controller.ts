import type { Request, Response, NextFunction } from "express";
import { getOrCreateSquadVirtualAccount, listSquadVirtualAccounts } from "../services/squad-dva.service";
import { squadGateway } from "../services/squad.service";
import { AppError } from "../../../shared/errors/AppError";
import { logger } from "../../../lib/logger";

// ── GET /wallet/squad-account ─────────────────────────────────────────────────
// Returns the customer's Squad virtual account, provisioning one if needed.
export async function getSquadAccountController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    if (!squadGateway.isConfigured()) {
      res.status(503).json({
        success: false,
        error:   "Squad virtual accounts are not available. Contact support.",
      });
      return;
    }

    const ACTIONABLE_CODES = new Set(["PROFILE_INCOMPLETE", "MISSING_BVN", "INVALID_BVN"]);

    let account;
    try {
      account = await getOrCreateSquadVirtualAccount(userId);
    } catch (err) {
      if (err instanceof AppError && ACTIONABLE_CODES.has(err.code)) {
        res.status(200).json({
          success: true,
          data:    null,
          code:    err.code,
          message: err.message,
        });
        return;
      }
      throw err;
    }

    logger.info("squad_dva_fetched", {
      user_id:                userId,
      virtual_account_number: account.virtual_account_number,
    });

    res.status(200).json({
      success: true,
      data: {
        virtual_account_number: account.virtual_account_number,
        account_name:           account.account_name,
        bank_name:              account.bank_name,
        bank_code:              account.bank_code,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/squad-virtual-accounts ─────────────────────────────────────────
export async function adminListSquadAccountsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "50",  10), 200);
    const offset = Math.max(parseInt((req.query.offset as string) ?? "0",   10), 0);

    const accounts = await listSquadVirtualAccounts({ limit, offset });

    res.status(200).json({
      success: true,
      data:    accounts,
      meta:    { limit, offset },
    });
  } catch (err) {
    next(err);
  }
}
