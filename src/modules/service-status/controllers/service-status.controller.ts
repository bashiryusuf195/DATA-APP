import type { Request, Response, NextFunction } from "express";
import { getAllServiceStatuses } from "../services/service-status.service";

export async function getServiceStatusController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await getAllServiceStatuses();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
