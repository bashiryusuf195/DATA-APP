import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listHealthMetrics,
  getHealthMetrics,
  resetCircuit,
} from "../services/provider-health-metrics.service";
import {
  getProviderHealthDashboard,
} from "../services/provider-health-dashboard.service";
import type { HealthWindow } from "../services/provider-health-dashboard.service";

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

// ── GET /admin/provider-health-dashboard ──────────────────────────────────────
//
// Query params:
//   window       — "1h" | "24h" | "7d"  (default "1h")
//   service_type — filter attempts by service (optional)
//   provider     — filter to a single provider_code (optional)

const DashboardQuerySchema = z.object({
  window:       z.enum(["1h", "24h", "7d"]).default("1h"),
  service_type: z.string().min(1).optional(),
  provider:     z.string().min(1).optional(),
});

export async function getHealthDashboardController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const { window, service_type, provider } = DashboardQuerySchema.parse(req.query);
    const data = await getProviderHealthDashboard({
      window:       window as HealthWindow,
      service_type: service_type,
      provider:     provider,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
