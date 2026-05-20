import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getGroupSummary, setGroupControl } from "../services/availability.service";

const SERVICE_TYPES = [
  "airtime", "data", "electricity", "cable_tv", "exam_pin", "identity_verification",
] as const;

const SetGroupControlSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  network_operator: z.string().min(1).max(100),
  plan_category: z.string().max(100).nullable().optional(),
  is_active: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
});

export async function listGroupSummaryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const service_type = typeof req.query.service_type === "string"
      ? req.query.service_type
      : undefined;
    const rows = await getGroupSummary(service_type);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function setGroupControlController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = SetGroupControlSchema.parse(req.body);
    const row = await setGroupControl({
      service_type: body.service_type,
      network_operator: body.network_operator,
      plan_category: body.plan_category ?? null,
      is_active: body.is_active,
      reason: body.reason ?? null,
      admin_id: req.user!.id,
      ip_address: req.ip ?? null,
      user_agent: (req.headers["user-agent"] as string) ?? null,
      request_id: (req.headers["x-request-id"] as string) ?? null,
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}
