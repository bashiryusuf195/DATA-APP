import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listProvidersWithCredentialStatus,
  getProviderConfigWithCredentials,
  upsertProviderCredentials,
} from "../services/provider-credentials.service";
import {
  createProviderConfig,
  updateProviderConfig,
  disableProviderConfig,
} from "../services/provider-config.service";
import { providerRegistry } from "../services/provider-registry.service";
import { HttpVTUProvider } from "../services/http-vtu.provider";
import type { ProviderServiceType } from "../types/provider.types";

// ── POST /admin/providers ─────────────────────────────────────────────────────

const CreateProviderSchema = z.object({
  provider_code:      z.string().min(1),
  name:               z.string().min(1),
  is_active:          z.boolean().optional(),
  priority:           z.number().int().min(1).optional(),
  supported_services: z.array(z.string()).optional(),
  health_status:      z.string().optional(),
  notes:              z.string().nullable().optional(),
  metadata:           z.record(z.unknown()).optional(),
});

export async function createProviderController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = CreateProviderSchema.parse(req.body);
    const row = await createProviderConfig({
      ...input,
      supported_services: input.supported_services as ProviderServiceType[] | undefined,
    });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/providers/:providerCode ──────────────────────────────────────

const UpdateProviderSchema = z.object({
  name:               z.string().min(1).optional(),
  is_active:          z.boolean().optional(),
  priority:           z.number().int().min(1).optional(),
  supported_services: z.array(z.string()).optional(),
  health_status:      z.string().optional(),
  notes:              z.string().nullable().optional(),
  metadata:           z.record(z.unknown()).optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: "At least one field must be provided",
});

export async function updateProviderController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;
    const input = UpdateProviderSchema.parse(req.body);
    const row = await updateProviderConfig(providerCode, {
      ...input,
      supported_services: input.supported_services as ProviderServiceType[] | undefined,
    });

    if (!row) {
      res.status(404).json({ success: false, error: "Provider not found" });
      return;
    }

    res.status(200).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /admin/providers/:providerCode ─────────────────────────────────────

export async function disableProviderController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;
    const row = await disableProviderConfig(providerCode);

    if (!row) {
      res.status(404).json({ success: false, error: "Provider not found" });
      return;
    }

    res.status(200).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

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

const AUTH_TYPE_VALUES = [
  "api_key",
  "api_key_secret",
  "bearer_token",
  "username_password",
  "custom_headers",
  "none",
  "advanced",
] as const;

const UpsertCredentialsSchema = z
  .object({
    auth_type:      z.enum(AUTH_TYPE_VALUES).optional(),
    base_url:       z.string().url().nullable().optional(),
    api_key:        z.string().nullable().optional(),
    secret_key:     z.string().nullable().optional(),
    username:       z.string().nullable().optional(),
    password:       z.string().nullable().optional(),
    bearer_token:   z.string().nullable().optional(),
    webhook_secret: z.string().nullable().optional(),
    // Stored as a JSON string; must be a valid JSON object if provided
    custom_headers: z.string().nullable().optional(),
    is_live:        z.boolean().optional(),
    metadata:       z.record(z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one credential field must be provided",
  })
  .superRefine((data, ctx) => {
    if (data.custom_headers && data.custom_headers.trim()) {
      try {
        const parsed = JSON.parse(data.custom_headers.trim());
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["custom_headers"],
            message: "custom_headers must be a JSON object, e.g. {\"X-Api-Key\": \"value\"}",
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["custom_headers"],
          message: "custom_headers must be valid JSON",
        });
      }
    }
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
