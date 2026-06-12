import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getPlanMappings,
  createPlanMapping,
  updatePlanMapping,
  deletePlanMapping,
} from "../services/provider-plan-mappings.service";
import {
  CreatePlanMappingSchema,
  UpdatePlanMappingSchema,
} from "../validators/provider-plan-mappings.validators";

/** GET /admin/plan-mappings?plan_id=X */
export async function listPlanMappingsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { plan_id } = req.query;
    if (!plan_id || typeof plan_id !== "string") {
      res.status(400).json({ success: false, error: "plan_id query param is required" });
      return;
    }
    const mappings = await getPlanMappings(plan_id);
    res.json({ success: true, data: mappings });
  } catch (err) {
    next(err);
  }
}

/** POST /admin/plan-mappings */
export async function createPlanMappingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input  = CreatePlanMappingSchema.parse(req.body);
    const mapping = await createPlanMapping(input);
    res.status(201).json({ success: true, data: mapping });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ success: false, error: err.errors[0]?.message ?? "Validation error" });
      return;
    }
    // Unique constraint violation: (plan_id, provider_code) already exists
    if ((err as NodeJS.ErrnoException).code === "23505") {
      res.status(409).json({ success: false, error: "A mapping for this provider already exists on this plan." });
      return;
    }
    next(err);
  }
}

/** PATCH /admin/plan-mappings/:id */
export async function updatePlanMappingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }  = req.params;
    const input   = UpdatePlanMappingSchema.parse(req.body);
    const mapping = await updatePlanMapping(id, input);
    if (!mapping) {
      res.status(404).json({ success: false, error: "Mapping not found" });
      return;
    }
    res.json({ success: true, data: mapping });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ success: false, error: err.errors[0]?.message ?? "Validation error" });
      return;
    }
    next(err);
  }
}

/** DELETE /admin/plan-mappings/:id */
export async function deletePlanMappingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }  = req.params;
    const deleted = await deletePlanMapping(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: "Mapping not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
