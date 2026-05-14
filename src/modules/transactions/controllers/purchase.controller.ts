import type { Request, Response, NextFunction } from "express";

import { AirtimePurchaseSchema } from "../validators/purchase.validators";
import { purchaseAirtime } from "../services/purchase.service";
import { queueService } from "../../queue/services/queue.service";


export async function purchaseAirtimeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = AirtimePurchaseSchema.parse(req.body);

    const result = await purchaseAirtime(req.user!.id, input);
await queueService.dispatch(
  "airtime_purchase",
  {
    user_id: req.user!.id,
    phone: input.phone,
    amount: input.amount,
    reference: result.reference,
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