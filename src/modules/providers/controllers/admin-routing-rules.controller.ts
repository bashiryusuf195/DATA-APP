import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listRoutingRules,
  createRoutingRule,
  updateRoutingRule,
} from "../services/provider-routing-rules.service";
import type { ProviderServiceType } from "../types/provider.types";

// ── GET /admin/provider-routing-rules ─────────────────────────────────────────

export async function listRoutingRulesController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rules = await listRoutingRules();
    res.status(200).json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/provider-routing-rules ────────────────────────────────────────

const CreateRuleSchema = z.object({
  service_type:           z.string().min(1),
  primary_provider_code:  z.string().min(1),
  fallback_provider_code: z.string().min(1).nullable().optional(),
  is_active:              z.boolean().optional(),
  metadata:               z.record(z.unknown()).optional(),
});

export async function createRoutingRuleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = CreateRuleSchema.parse(req.body);
    const rule = await createRoutingRule({
      ...input,
      service_type: input.service_type as ProviderServiceType,
    });
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/provider-routing-rules/:id ───────────────────────────────────

const UpdateRuleSchema = z.object({
  service_type:           z.string().min(1).optional(),
  primary_provider_code:  z.string().min(1).optional(),
  fallback_provider_code: z.string().min(1).nullable().optional(),
  is_active:              z.boolean().optional(),
  metadata:               z.record(z.unknown()).optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: "At least one field must be provided",
});

export async function updateRoutingRuleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const input = UpdateRuleSchema.parse(req.body);
    const rule = await updateRoutingRule(id, {
      ...input,
      service_type: input.service_type as ProviderServiceType | undefined,
    });

    if (!rule) {
      res.status(404).json({ success: false, error: "Routing rule not found" });
      return;
    }

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}
