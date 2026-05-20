import { Request, Response } from "express";
import { z } from "zod";
import {
  listPaymentGateways,
  getPaymentGateway,
  createPaymentGateway,
  updatePaymentGateway,
  setDefaultGateway,
  enableGateway,
  disableGateway,
} from "../services/payment-gateway.service";

const CreateSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, "code must be lowercase alphanumeric"),
  name: z.string().min(1).max(200),
  is_active: z.boolean().optional(),
  is_live: z.boolean().optional(),
  base_url: z.string().url().nullable().optional(),
  public_key: z.string().max(500).nullable().optional(),
  secret_key: z.string().max(1000).nullable().optional(),
  webhook_secret: z.string().max(1000).nullable().optional(),
  charge_type: z.enum(["flat", "percentage", "none"]).optional(),
  charge_value: z.number().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
  is_live: z.boolean().optional(),
  base_url: z.string().url().nullable().optional(),
  public_key: z.string().max(500).nullable().optional(),
  secret_key: z.string().max(1000).nullable().optional(),
  webhook_secret: z.string().max(1000).nullable().optional(),
  charge_type: z.enum(["flat", "percentage", "none"]).optional(),
  charge_value: z.number().min(0).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function listPaymentGatewaysController(req: Request, res: Response): Promise<void> {
  const gateways = await listPaymentGateways();
  res.json({ success: true, data: gateways });
}

export async function getPaymentGatewayController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const gateway = await getPaymentGateway(id);
  if (!gateway) {
    res.status(404).json({ success: false, message: "Payment gateway not found" });
    return;
  }
  res.json({ success: true, data: gateway });
}

export async function createPaymentGatewayController(req: Request, res: Response): Promise<void> {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Validation error", errors: parsed.error.flatten() });
    return;
  }
  const gateway = await createPaymentGateway(parsed.data);
  res.status(201).json({ success: true, data: gateway });
}

export async function updatePaymentGatewayController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Validation error", errors: parsed.error.flatten() });
    return;
  }
  const existing = await getPaymentGateway(id);
  if (!existing) {
    res.status(404).json({ success: false, message: "Payment gateway not found" });
    return;
  }
  const gateway = await updatePaymentGateway(id, parsed.data);
  res.json({ success: true, data: gateway });
}

export async function setDefaultGatewayController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const existing = await getPaymentGateway(id);
  if (!existing) {
    res.status(404).json({ success: false, message: "Payment gateway not found" });
    return;
  }
  if (!existing.is_active) {
    res.status(400).json({ success: false, message: "Cannot set an inactive gateway as default" });
    return;
  }
  const gateway = await setDefaultGateway(id);
  res.json({ success: true, data: gateway });
}

export async function enableGatewayController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const existing = await getPaymentGateway(id);
  if (!existing) {
    res.status(404).json({ success: false, message: "Payment gateway not found" });
    return;
  }
  const gateway = await enableGateway(id);
  res.json({ success: true, data: gateway });
}

export async function disableGatewayController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const existing = await getPaymentGateway(id);
  if (!existing) {
    res.status(404).json({ success: false, message: "Payment gateway not found" });
    return;
  }
  if (existing.is_default) {
    res.status(400).json({ success: false, message: "Cannot disable the default gateway. Set another gateway as default first." });
    return;
  }
  const gateway = await disableGateway(id);
  res.json({ success: true, data: gateway });
}
