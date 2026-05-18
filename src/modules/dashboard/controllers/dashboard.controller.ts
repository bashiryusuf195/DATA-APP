import type { Request, Response, NextFunction } from "express";
import { getDashboardMetrics } from "../services/dashboard.service";

export async function dashboardMetricsController(
  _req: Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getDashboardMetrics();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
