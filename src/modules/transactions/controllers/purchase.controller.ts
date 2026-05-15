import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { AirtimePurchaseSchema } from "../validators/purchase.validators";

import { initializeAirtimePurchase } from "../services/purchase.service";

import { airtimeQueue } from "../../queue/queues/airtime.queue";

export async function purchaseAirtimeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input =
      AirtimePurchaseSchema.parse(req.body);

    const result =
      await initializeAirtimePurchase(
        req.user!.id,
        input
      );

    await airtimeQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        phone: input.phone,
        amount: input.amount,
        reference: result.reference,
      },
      {
        jobId: result.reference,
      }
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}