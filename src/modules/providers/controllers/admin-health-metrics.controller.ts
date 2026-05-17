import type { Request, Response, NextFunction } from "express";
import {
  listHealthMetrics,
  getHealthMetrics,
  resetCircuit,
} from "../services/provider-health-metrics.service";

export async function listHealthMetricsController(
  _req: Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const metrics = await listHealthMetrics();
    res.json({ data: metrics });
  } catch (err) {
    next(err);
  }
}

export async function getHealthMetricsController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;
    const metrics = await getHealthMetrics(providerCode);
    if (!metrics) {
      res.status(404).json({ error: "No health metrics found for this provider" });
      return;
    }
    res.json({ data: metrics });
  } catch (err) {
    next(err);
  }
}

export async function resetCircuitController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;

    const existing = await getHealthMetrics(providerCode);
    if (!existing) {
      res.status(404).json({ error: "No health metrics found for this provider" });
      return;
    }

    await resetCircuit(providerCode);

    res.json({
      message: `Circuit reset for provider '${providerCode}'`,
      data: { provider_code: providerCode },
    });
  } catch (err) {
    next(err);
  }
}
