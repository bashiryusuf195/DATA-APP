import type { Request, Response, NextFunction } from "express";
import { getOrCreateDedicatedAccount } from "../services/dva.service";
import { paystackGateway } from "../services/paystack.service";
import { AppError } from "../../../shared/errors/AppError";
import { logger } from "../../../lib/logger";

// GET /wallet/account
// Returns the customer's dedicated virtual account, provisioning one if needed.
export async function getDedicatedAccountController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    if (!paystackGateway.isConfigured()) {
      res.status(503).json({
        success: false,
        error:   "Dedicated accounts are not available. Contact support.",
      });
      return;
    }

    const account = await getOrCreateDedicatedAccount(userId);

    logger.info("dva_fetched", { user_id: userId, account_number: account.account_number });

    res.status(200).json({
      success: true,
      data: {
        account_number: account.account_number,
        account_name:   account.account_name,
        bank_name:      account.bank_name,
        bank_slug:      account.bank_slug,
      },
    });
  } catch (err) {
    // Profile incomplete — surface clean message without a 500.
    if (err instanceof AppError && err.code === "PROFILE_INCOMPLETE") {
      res.status(422).json({ success: false, code: "PROFILE_INCOMPLETE", error: err.message });
      return;
    }

    // Paystack plan doesn't have DVA enabled.
    const msg = (err as Error).message ?? "";
    if (msg.includes("not available for your business") || msg.includes("Dedicated NUBAN")) {
      res.status(503).json({
        success:     false,
        code:        "DVA_NOT_ENABLED",
        error:       "Dedicated bank accounts are not enabled on this Paystack account yet.",
      });
      return;
    }

    next(err);
  }
}
