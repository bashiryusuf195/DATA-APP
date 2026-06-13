import type { Request, Response, NextFunction } from "express";
import { getProfitAnalytics } from "../services/profit-analytics.service";

/** GET /admin/analytics/profit?month=YYYY-MM */
export async function profitAnalyticsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Default to current month when not provided or malformed
    const rawMonth = String(req.query.month ?? "");
    const month    = /^\d{4}-\d{2}$/.test(rawMonth)
      ? rawMonth
      : new Date().toISOString().slice(0, 7); // "YYYY-MM"

    const data = await getProfitAnalytics(month);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
