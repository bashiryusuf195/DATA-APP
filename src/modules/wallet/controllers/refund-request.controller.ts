import type { Request, Response, NextFunction } from "express";
import { RefundRequestSchema } from "../validators/wallet.validators";
import { createTicket } from "../../support/services/support.service";

/**
 * POST /wallet/refund-request
 *
 * Customer submits a refund request when they accidentally transferred money
 * into their wallet and need it returned to their bank account.
 * Creates a billing support ticket visible to admin.
 */
export async function refundRequestController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = RefundRequestSchema.parse(req.body);
    const user  = req.user!;

    const description = [
      "WALLET REFUND REQUEST",
      "─────────────────────",
      `Account Number : ${input.account_number}`,
      `Bank Name      : ${input.bank_name}`,
      `Amount         : ₦${input.amount.toLocaleString()}`,
      input.description ? `\nNote: ${input.description}` : "",
      "",
      `Submitted by   : ${user.email ?? user.id}`,
    ]
      .filter((l) => l !== "")
      .join("\n");

    const ticket = await createTicket({
      user_id:     user.id,
      user_email:  user.email ?? null,
      subject:     `Wallet Refund Request – ₦${input.amount.toLocaleString()} to ${input.bank_name}`,
      description,
      category:    "billing",
      priority:    "high",
      status:      "open",
    });

    res.status(201).json({
      success: true,
      data:    { reference: ticket.reference },
    });
  } catch (err) {
    next(err);
  }
}
