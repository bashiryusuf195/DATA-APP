import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../../shared/errors/AppError";
import {
  createCatalogService,
  updateCatalogService,
  createServicePlan,
  updateServicePlan,
} from "../services/catalog.service";

const SERVICE_TYPES = [
  "airtime",
  "data",
  "electricity",
  "cable_tv",
  "exam_pin",
  "identity_verification",
] as const;

const SlugFormat = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens only");

// ── Service schemas ───────────────────────────────────────────────────────────

const CreateServiceSchema = z.object({
  slug: SlugFormat,
  name: z.string().min(1).max(200),
  service_type: z.enum(SERVICE_TYPES),
  is_active: z.boolean().default(true),
});

const UpdateServiceSchema = z
  .object({
    slug: SlugFormat.optional(),
    name: z.string().min(1).max(200).optional(),
    service_type: z.enum(SERVICE_TYPES).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

// ── Service-plan schemas ──────────────────────────────────────────────────────

const CreateServicePlanSchema = z.object({
  service_id: z.string().uuid(),
  provider_code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  variation_code: z.string().min(1).max(100),
  amount: z.number().min(0),
  cost_price: z.number().min(0).nullable().optional(),
  selling_price: z.number().min(0).nullable().optional(),
  is_variable_amount: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});

const UpdateServicePlanSchema = z
  .object({
    service_id: z.string().uuid().optional(),
    provider_code: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(200).optional(),
    variation_code: z.string().min(1).max(100).optional(),
    amount: z.number().min(0).optional(),
    cost_price: z.number().min(0).nullable().optional(),
    selling_price: z.number().min(0).nullable().optional(),
    is_variable_amount: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

// ── Controllers ───────────────────────────────────────────────────────────────

export async function createServiceController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = CreateServiceSchema.parse(req.body);
    const service = await createCatalogService(data);
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
}

export async function updateServiceController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = UpdateServiceSchema.parse(req.body);
    const service = await updateCatalogService(req.params.id, data);
    if (!service) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
    }
    res.status(200).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
}

export async function createServicePlanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = CreateServicePlanSchema.parse(req.body);
    const plan = await createServicePlan(data);
    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

export async function updateServicePlanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = UpdateServicePlanSchema.parse(req.body);
    const plan = await updateServicePlan(req.params.id, data);
    if (!plan) {
      throw new AppError(404, "PLAN_NOT_FOUND", "Service plan not found");
    }
    res.status(200).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}
