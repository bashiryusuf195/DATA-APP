import type { Request, Response, NextFunction } from "express";

import { AirtimePurchaseSchema } from "../validators/purchase.validators";
import { purchaseAirtime } from "../services/purchase.service";

export async function purchaseAirtimeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = AirtimePurchaseSchema.parse(req.body);

    const result = await purchaseAirtime(req.user!.id, input);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}