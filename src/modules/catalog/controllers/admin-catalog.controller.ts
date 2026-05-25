import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { AppError } from "../../../shared/errors/AppError";
import {
  adminListServices,
  adminListServicePlans,
  bulkToggleServicePlans,
  getCategoryProviderSummary,
  bulkAssignProvider,
  bulkClearProviderOverride,
  bulkSetProviderById,
  createCatalogService,
  updateCatalogService,
  createServicePlan,
  updateServicePlan,
  bulkImportServicePlans,
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
  network_operator: z.string().max(100).nullable().optional(),
  plan_category: z.string().max(100).nullable().optional(),
  duration_days: z.number().int().positive().nullable().optional(),
  primary_provider_code: z.string().max(100).nullable().optional(),
  fallback_provider_code: z.string().max(100).nullable().optional(),
  provider_variation_code: z.string().max(100).nullable().optional(),
  provider_metadata: z.record(z.unknown()).default({}),
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
    network_operator: z.string().max(100).nullable().optional(),
    plan_category: z.string().max(100).nullable().optional(),
    duration_days: z.number().int().positive().nullable().optional(),
    primary_provider_code: z.string().max(100).nullable().optional(),
    fallback_provider_code: z.string().max(100).nullable().optional(),
    provider_variation_code: z.string().max(100).nullable().optional(),
    provider_metadata: z.record(z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

const BulkTogglePlansSchema = z.object({
  service_id: z.string().uuid().optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  network_operator: z.string().max(100).optional(),
  plan_category: z.string().max(100).optional(),
  is_active: z.boolean(),
});

// ── List controllers ──────────────────────────────────────────────────────────

export async function listServicesAdminController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const service_type = typeof req.query.service_type === "string" ? req.query.service_type : undefined;
    const is_active =
      req.query.is_active === "true" ? true
      : req.query.is_active === "false" ? false
      : undefined;
    const services = await adminListServices({ service_type, is_active });
    res.json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
}

export async function listServicePlansAdminController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const str = (key: string) => typeof req.query[key] === "string" ? req.query[key] as string : undefined;
    const service_id       = str("service_id");
    const service_type     = str("service_type");
    const provider_code    = str("provider_code");
    const network_operator = str("network_operator");
    const plan_category    = str("plan_category");
    const search           = str("search");
    const is_active =
      req.query.is_active === "true" ? true
      : req.query.is_active === "false" ? false
      : undefined;
    const limit  = req.query.limit  ? parseInt(req.query.limit  as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const has_provider_override =
      req.query.has_provider_override === "true" ? true
      : req.query.has_provider_override === "false" ? false
      : undefined;

    const { plans, total } = await adminListServicePlans({
      service_id, service_type, provider_code, network_operator,
      plan_category, search, is_active, has_provider_override, limit, offset,
    });
    res.json({
      success: true,
      data: plans,
      meta: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
}

// ── Write controllers ─────────────────────────────────────────────────────────

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

export async function getCategoryProvidersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rows = await getCategoryProviderSummary();
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

const BulkAssignProviderSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  network_operator: z.string().max(100).nullable().optional(),
  plan_category: z.string().max(100).nullable().optional(),
  primary_provider_code: z.string().min(1).max(100),
  fallback_provider_code: z.string().max(100).nullable().optional(),
});

export async function bulkAssignProviderController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = BulkAssignProviderSchema.parse(req.body);
    const count = await bulkAssignProvider(
      {
        service_type: body.service_type,
        network_operator: body.network_operator,
        plan_category: body.plan_category,
      },
      body.primary_provider_code,
      body.fallback_provider_code,
    );
    res.json({ success: true, data: { updated: count } });
  } catch (err) {
    next(err);
  }
}

const BulkClearOverrideSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

const BulkSetProviderByIdSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  primary_provider_code:  z.string().min(1).max(100),
  fallback_provider_code: z.string().max(100).nullable().optional(),
});

export async function bulkClearOverrideController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ids } = BulkClearOverrideSchema.parse(req.body);
    const count = await bulkClearProviderOverride(ids);
    res.json({ success: true, data: { updated: count } });
  } catch (err) {
    next(err);
  }
}

export async function bulkSetProviderByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ids, primary_provider_code, fallback_provider_code } = BulkSetProviderByIdSchema.parse(req.body);
    const count = await bulkSetProviderById(ids, primary_provider_code, fallback_provider_code);
    res.json({ success: true, data: { updated: count } });
  } catch (err) {
    next(err);
  }
}

export async function bulkToggleServicePlansController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { is_active, ...filters } = BulkTogglePlansSchema.parse(req.body);
    const count = await bulkToggleServicePlans(filters, is_active);
    res.json({ success: true, data: { updated: count } });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/service-plans/bulk-import ─────────────────────────────────────

const BulkImportPlanItemSchema = z.object({
  name:                    z.string().min(1).max(200),
  variation_code:          z.string().min(1).max(100),
  amount:                  z.number().min(0),
  cost_price:              z.number().min(0).nullable().optional(),
  selling_price:           z.number().min(0).nullable().optional(),
  network_operator:        z.string().max(100).nullable().optional(),
  plan_category:           z.string().max(100).nullable().optional(),
  duration_days:           z.number().int().positive().nullable().optional(),
  provider_variation_code: z.string().max(100).nullable().optional(),
});

const BulkImportSchema = z.object({
  service_id:           z.string().uuid(),
  provider_code:        z.string().min(1),
  primary_provider_code: z.string().min(1),
  plans:                z.array(BulkImportPlanItemSchema).min(1).max(500),
});

export async function bulkImportServicePlansController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { service_id, provider_code, primary_provider_code, plans } =
      BulkImportSchema.parse(req.body);

    const result = await bulkImportServicePlans(
      service_id,
      provider_code,
      primary_provider_code,
      plans,
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
