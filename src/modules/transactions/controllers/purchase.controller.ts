import type { Request, Response, NextFunction } from "express";

import { AppError } from "../../../shared/errors/AppError";
import { checkPurchaseVelocity } from "../services/velocity.service";

import {
  AirtimePurchaseSchema,
  DataPurchaseSchema,
  ElectricityPurchaseSchema,
  ElectricityVerifySchema,
  CableTvPurchaseSchema,
  CableTvVerifySchema,
  ExamPinPurchaseSchema,
  IdentityVerificationSchema,
} from "../validators/purchase.validators";

import { initializeAirtimePurchase } from "../services/purchase.service";
import { initializeVtuPurchase } from "../services/vtu-purchase.service";
import { getPlanByVariationCode, getCablePlanForBiller } from "../../catalog/services/catalog.service";
import { providerRegistry } from "../../providers/services/provider-registry.service";

import { airtimeQueue } from "../../queue/queues/airtime.queue";
import { vtuPurchaseQueue } from "../../queue/queues/vtu-purchase.queue";
import { defaultJobOptions } from "../../queue/config/queue.config";

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

// Extracts the fields required by VtuPlanMeta from a plan row.
function buildPlanMeta(plan: {
  id: string;
  variation_code: string;
  name: string;
  service_slug: string;
  service_name: string;
}) {
  return {
    plan_id: plan.id,
    variation_code: plan.variation_code,
    plan_name: plan.name,
    service_slug: plan.service_slug,
    service_name: plan.service_name,
  };
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
        user_id:        req.user!.id,
        phone:          input.phone,
        amount:         input.amount,
        reference:      result.reference,
        variation_code: input.variation_code,
      },
      { ...defaultJobOptions, jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
    void checkPurchaseVelocity(req.user!.id, { serviceType: "airtime", reference: result.reference }).catch(() => undefined);
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
      plan: buildPlanMeta(plan),
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
      { ...defaultJobOptions, jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
    void checkPurchaseVelocity(req.user!.id, { serviceType: "data", reference: result.reference }).catch(() => undefined);
  } catch (err) {
    next(err);
  }
}

export async function verifyMeterController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = ElectricityVerifySchema.parse(req.body);

    const plan = await requirePlan("electricity", input.variation_code);

    // Resolve the first configured provider that supports meter verification.
    // We try primary_provider_code → provider_code → "clubkonnect" (default
    // electricity provider) so a stale or wrong primary_provider_code cannot
    // silently block verification.
    const candidateCodes = [
      plan.primary_provider_code as string | null,
      plan.provider_code         as string | null,
      "clubkonnect",
    ].filter((c): c is string => !!c);

    let verifyMeterFn: ((input: Parameters<NonNullable<ReturnType<typeof providerRegistry.getProvider>["verifyMeter"]>>[0]) => Promise<import("../../providers/types/provider.types").MeterVerifyResult>) | null = null;
    let resolvedProviderCode = "";
    for (const code of candidateCodes) {
      try {
        const p = providerRegistry.getProvider(code);
        if (p.verifyMeter) {
          verifyMeterFn = p.verifyMeter.bind(p);
          resolvedProviderCode = code;
          break;
        }
      } catch { /* not registered */ }
    }

    if (!verifyMeterFn) {
      throw new AppError(
        400,
        "NOT_SUPPORTED",
        "No configured provider supports meter verification for this plan. " +
        "Ensure the plan uses Clubkonnect as its provider."
      );
    }

    const discoId   = (plan.provider_variation_code as string | null) ?? "";
    const meterType = (plan.plan_category           as string | null) ?? "prepaid";

    if (!discoId) {
      throw new AppError(
        400,
        "MISSING_DISCO_ID",
        "Provider Variation Code is not set for this electricity plan. " +
        "Go to Admin → Service Plans and set 'Provider Variation Code' to the " +
        "Clubkonnect numeric DISCO ID " +
        "(01=EKEDC, 02=IKEDC, 03=AEDC, 04=KEDC, 05=PHEDC, 06=JEDC, " +
        "07=IBEDC, 08=KAEDC, 09=EEDC, 10=BEDC, 11=YEDC, 12=ABA/APLE)."
      );
    }

    let result;
    try {
      result = await verifyMeterFn({
        meter_number: input.meter_number,
        disco_name:   discoId,
        meter_type:   meterType,
      });
    } catch (provErr) {
      const msg = provErr instanceof Error ? provErr.message : String(provErr);
      throw new AppError(502, "PROVIDER_ERROR", `Meter verification failed (${resolvedProviderCode}): ${msg}`);
    }

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

    const plan = await requirePlan("electricity", input.variation_code);

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type:           "electricity",
      amount:                 input.amount,
      meter_number:           input.meter_number,
      variation_code:         input.variation_code,
      phone:                  input.phone,
      verified_customer_name: input.verified_customer_name,
      description:            `Electricity top-up for meter ${input.meter_number}`,
      plan:                   buildPlanMeta(plan),
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id:        req.user!.id,
        reference:      result.reference,
        service_type:   "electricity",
        amount:         input.amount,
        meter_number:   input.meter_number,
        variation_code: input.variation_code,
        phone:          input.phone,
      },
      { ...defaultJobOptions, jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
    void checkPurchaseVelocity(req.user!.id, { serviceType: "electricity", reference: result.reference }).catch(() => undefined);
  } catch (err) {
    next(err);
  }
}

export async function verifyCableController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = CableTvVerifySchema.parse(req.body);

    const billerPlan = await getCablePlanForBiller(input.biller_code);
    if (!billerPlan) {
      throw new AppError(
        400,
        "NO_PLANS_FOR_BILLER",
        `No active cable TV plans found for biller '${input.biller_code}'. ` +
        "Create at least one plan with this network_operator in Admin → Service Plans."
      );
    }

    const providerCode = billerPlan.primary_provider_code ?? billerPlan.provider_code;
    if (!providerCode) {
      throw new AppError(400, "NO_PROVIDER", "No provider configured for this cable TV biller");
    }

    let provider;
    try {
      provider = providerRegistry.getProvider(providerCode);
    } catch {
      throw new AppError(400, "PROVIDER_NOT_FOUND", `Provider '${providerCode}' is not registered. Update the plan's provider in Admin → Service Plans.`);
    }

    if (!provider.verifyCable) {
      throw new AppError(400, "NOT_SUPPORTED", `Provider '${providerCode}' does not support cable decoder verification`);
    }

    let result;
    try {
      result = await provider.verifyCable({
        smartcard_number: input.smartcard_number,
        biller_code:      input.biller_code,
      });
    } catch (provErr) {
      const msg = provErr instanceof Error ? provErr.message : String(provErr);
      throw new AppError(502, "PROVIDER_ERROR", `Decoder verification failed (${providerCode}): ${msg}`);
    }

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
    const plan  = await requirePlan("cable_tv", input.variation_code);
    const amount = planChargeAmount(plan)!;

    const result = await initializeVtuPurchase(req.user!.id, {
      service_type:           "cable_tv",
      amount,
      smartcard_number:       input.smartcard_number,
      variation_code:         input.variation_code,
      phone:                  input.phone,
      verified_customer_name: input.verified_customer_name,
      description:            `Cable TV — ${plan.name} for ${input.smartcard_number}`,
      plan:                   buildPlanMeta(plan),
    });

    await vtuPurchaseQueue.add(
      "purchase",
      {
        user_id:          req.user!.id,
        reference:        result.reference,
        service_type:     "cable_tv",
        amount,
        smartcard_number: input.smartcard_number,
        variation_code:   input.variation_code,
        phone:            input.phone,
      },
      { ...defaultJobOptions, jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
    void checkPurchaseVelocity(req.user!.id, { serviceType: "cable_tv", reference: result.reference }).catch(() => undefined);
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
      plan: buildPlanMeta(plan),
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
      { ...defaultJobOptions, jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
    void checkPurchaseVelocity(req.user!.id, { serviceType: "exam_pin", reference: result.reference }).catch(() => undefined);
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
      plan: buildPlanMeta(plan),
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
      { ...defaultJobOptions, jobId: result.reference }
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
