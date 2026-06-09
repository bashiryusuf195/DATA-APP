import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getAllServiceStatuses,
  updateServiceStatus,
} from "../services/service-status.service";

const StatusEnum = z.enum(["available", "delayed", "maintenance", "unavailable"]);

const UpdateSchema = z.object({
  status:            StatusEnum.optional(),
  message:           z.string().max(500).nullable().optional(),
  maintenance_start: z.string().datetime().nullable().optional(),
  maintenance_end:   z.string().datetime().nullable().optional(),
});

export async function listServiceStatusController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await getAllServiceStatuses();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateServiceStatusController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { key } = req.params;
    const body    = UpdateSchema.parse(req.body);
    const row     = await updateServiceStatus(key, { ...body, updated_by: req.user!.id });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
}
