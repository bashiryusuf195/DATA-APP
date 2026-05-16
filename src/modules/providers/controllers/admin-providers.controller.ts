import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listProvidersWithCredentialStatus,
  getProviderConfigWithCredentials,
  upsertProviderCredentials,
} from "../services/provider-credentials.service";
import { providerRegistry } from "../services/provider-registry.service";
import { HttpVTUProvider } from "../services/http-vtu.provider";

// ── GET /admin/providers ──────────────────────────────────────────────────────

export async function listProvidersController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const providers = await listProvidersWithCredentialStatus();
    res.status(200).json({ success: true, data: providers });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/providers/:providerCode ────────────────────────────────────────

export async function getProviderController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;
    const provider = await getProviderConfigWithCredentials(providerCode);

    if (!provider) {
      res.status(404).json({ success: false, error: "Provider not found" });
      return;
    }

    res.status(200).json({ success: true, data: provider });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/providers/:providerCode/credentials ──────────────────────────

const UpsertCredentialsSchema = z
  .object({
    base_url:   z.string().url().nullable().optional(),
    api_key:    z.string().nullable().optional(),
    secret_key: z.string().nullable().optional(),
    username:   z.string().nullable().optional(),
    password:   z.string().nullable().optional(),
    is_live:    z.boolean().optional(),
    metadata:   z.record(z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one credential field must be provided",
  });

export async function upsertCredentialsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;
    const input = UpsertCredentialsSchema.parse(req.body);

    const credentials = await upsertProviderCredentials({
      provider_code: providerCode,
      ...input,
    });

    res.status(200).json({ success: true, data: credentials });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/providers/:providerCode/health-check ──────────────────────────

export async function healthCheckController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;

    // Use the registered instance if available; fall back to the HTTP placeholder
    // (which returns a safe degraded result rather than throwing).
    let provider;
    try {
      provider = providerRegistry.getProvider(providerCode);
    } catch {
      provider = new HttpVTUProvider(providerCode);
    }

    const start  = Date.now();
    const result = await provider.healthCheck();
    const latency = Date.now() - start;

    res.status(200).json({
      success: true,
      data: {
        provider_code: providerCode,
        ...result,
        latency_ms: result.latency_ms ?? latency,
      },
    });
  } catch (err) {
    next(err);
  }
}
