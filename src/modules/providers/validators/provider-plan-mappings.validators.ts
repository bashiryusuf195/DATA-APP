import { z } from "zod";

export const CreatePlanMappingSchema = z.object({
  plan_id:             z.string().uuid(),
  provider_code:       z.string().min(1).max(100),
  provider_plan_code:  z.string().min(1).max(200),
  provider_cost_price: z.number().positive().nullable().optional().default(null),
  provider_operator:   z.string().min(1).max(100).nullable().optional().default(null),
  provider_category:   z.string().min(1).max(100).nullable().optional().default(null),
  priority:            z.number().int().min(0).max(9999).optional().default(100),
  enabled:             z.boolean().optional().default(true),
  allow_loss_fallback: z.boolean().optional().default(false),
  metadata:            z.record(z.unknown()).optional().default({}),
});

export const UpdatePlanMappingSchema = z.object({
  provider_plan_code:  z.string().min(1).max(200).optional(),
  provider_cost_price: z.number().positive().nullable().optional(),
  provider_operator:   z.string().min(1).max(100).nullable().optional(),
  provider_category:   z.string().min(1).max(100).nullable().optional(),
  priority:            z.number().int().min(0).max(9999).optional(),
  enabled:             z.boolean().optional(),
  allow_loss_fallback: z.boolean().optional(),
  metadata:            z.record(z.unknown()).optional(),
});

export type CreatePlanMappingInput = z.infer<typeof CreatePlanMappingSchema>;
export type UpdatePlanMappingInput = z.infer<typeof UpdatePlanMappingSchema>;
