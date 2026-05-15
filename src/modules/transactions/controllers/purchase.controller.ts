import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../../shared/errors/AppError";

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
import { getPlanByVariationCode } from "../../catalog/services/catalog.service";

import { airtimeQueue } from "../../queue/queues/airtime.queue";
import { vtuPurchaseQueue } from "../../queue/queues/vtu-purchase.queue";

// Resolves the effective charge amount from a plan.
// Fixed-price plans use selling_price (if set) or amount.
// Variable-amount plans (e.g. electricity) return null — caller supplies amount.
function planChargeAmount(plan: {
  amount: number | string;
  selling_price: number | string | null;
  is_variable_amount: boolean;
}): number | null {
  if (plan.is_variable_amount) return null;
  const sp = plan.selling_price !== null ? Number(plan.selling_price) : null;
  return sp !== null && sp > 0 ? sp : Number(plan.amount);
}

// Shared plan lookup — throws 400 if plan is missing or inactive.
async function requirePlan(serviceType: string, variationCode: string) {
  const plan = await getPlanByVariationCode(serviceType, variationCode);
  if (!plan) {
    throw new AppError(
      400,
      "INVALID_PLAN",
      `No active plan found for variation_code "${variationCode}" in service type "${serviceType}"`
    );
  }
  return plan;
}

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
    const plan = await requirePlan("data", input.variation_code);
    const amount = planChargeAmount(plan)!;

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "data",
      amount,
      phone: input.phone,
      variation_code: input.variation_code,
      description: `Data purchase for ${input.phone} — ${plan.name}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "data",
        amount,
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

    // Validates that the variation_code (prepaid/postpaid) exists in the catalog.
    await requirePlan("electricity", input.variation_code);

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "electricity",
      amount: input.amount,          // user-supplied for variable top-up
      meter_number: input.meter_number,
      variation_code: input.variation_code,
      phone: input.phone,
      description: `Electricity ${input.variation_code} top-up for meter ${input.meter_number}`,
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
    const plan = await requirePlan("cable_tv", input.variation_code);
    const amount = planChargeAmount(plan)!;

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "cable_tv",
      amount,
      smartcard_number: input.smartcard_number,
      variation_code: input.variation_code,
      description: `Cable TV purchase for ${input.smartcard_number} — ${plan.name}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "cable_tv",
        amount,
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
    const plan = await requirePlan("exam_pin", input.variation_code);
    const amount = planChargeAmount(plan)!;

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "exam_pin",
      amount,
      phone: input.phone,
      variation_code: input.variation_code,
      description: `Exam PIN purchase for ${input.phone} — ${plan.name}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "exam_pin",
        amount,
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
    const plan = await requirePlan("identity_verification", input.variation_code);
    const amount = planChargeAmount(plan)!;

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type: "identity_verification",
      amount,
      phone: input.phone,
      customer_name: input.customer_name,
      variation_code: input.variation_code,
      description: `Identity verification (${input.variation_code.toUpperCase()}) for ${input.phone ?? input.customer_name}`,
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id: req.user!.id,
        reference: result.reference,
        service_type: "identity_verification",
        amount,
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
