import type { Request, Response, NextFunction } from "express";

import {
  AirtimePurchaseSchema,
  DataPurchaseSchema,
  ElectricityPurchaseSchema,
  CableTvPurchaseSchema,
  ExamPinPurchaseSchema,
  IdentityVerificationSchema,
} from "../validators/purchase.validators";

import { initializeAirtimePurchase } from "../services/purchase.service";
import { initializeVtuPurchase } from "../services/vtu-purchase.service";

import { airtimeQueue } from "../../queue/queues/airtime.queue";
import { vtuPurchaseQueue } from "../../queue/queues/vtu-purchase.queue";

export async function purchaseAirtimeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = AirtimePurchaseSchema.parse(req.body);

    const result = await initializeAirtimePurchase(req.user!.id, input);

    await airtimeQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        phone: input.phone,
        amount: input.amount,
        reference: result.reference,
      },
      { jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function purchaseDataController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = DataPurchaseSchema.parse(req.body);

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "data",
      amount: input.amount,
      phone: input.phone,
      variation_code: input.variation_code,
      description: `Data purchase for ${input.phone}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "data",
        amount: input.amount,
        phone: input.phone,
        variation_code: input.variation_code,
      },
      { jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function purchaseElectricityController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = ElectricityPurchaseSchema.parse(req.body);

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "electricity",
      amount: input.amount,
      meter_number: input.meter_number,
      variation_code: input.variation_code,
      phone: input.phone,
      description: `Electricity purchase for meter ${input.meter_number}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "electricity",
        amount: input.amount,
        meter_number: input.meter_number,
        variation_code: input.variation_code,
        phone: input.phone,
      },
      { jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function purchaseCableTvController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = CableTvPurchaseSchema.parse(req.body);

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "cable_tv",
      amount: input.amount,
      smartcard_number: input.smartcard_number,
      variation_code: input.variation_code,
      description: `Cable TV purchase for ${input.smartcard_number}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "cable_tv",
        amount: input.amount,
        smartcard_number: input.smartcard_number,
        variation_code: input.variation_code,
      },
      { jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function purchaseExamPinController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = ExamPinPurchaseSchema.parse(req.body);

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "exam_pin",
      amount: input.amount,
      phone: input.phone,
      variation_code: input.variation_code,
      description: `Exam PIN purchase for ${input.phone}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "exam_pin",
        amount: input.amount,
        phone: input.phone,
        variation_code: input.variation_code,
      },
      { jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function identityVerificationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = IdentityVerificationSchema.parse(req.body);

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "identity_verification",
      amount: input.amount,
      phone: input.phone,
      customer_name: input.customer_name,
      variation_code: input.variation_code,
      description: `Identity verification for ${input.phone ?? input.customer_name}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "identity_verification",
        amount: input.amount,
        phone: input.phone,
        customer_name: input.customer_name,
        variation_code: input.variation_code,
      },
      { jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
