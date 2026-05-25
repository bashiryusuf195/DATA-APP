import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listProvidersWithCredentialStatus,
  getProviderConfigWithCredentials,
  upsertProviderCredentials,
  getProviderCredentials,
} from "../services/provider-credentials.service";
import {
  createProviderConfig,
  updateProviderConfig,
  disableProviderConfig,
} from "../services/provider-config.service";
import { providerRegistry } from "../services/provider-registry.service";
import { HttpVTUProvider } from "../services/http-vtu.provider";
import { LegitDataWayProvider } from "../services/legitdataway.provider";
import { SmshikaProvider }      from "../services/smshika.provider";
import type { ProviderServiceType } from "../types/provider.types";
import { logger } from "../../../lib/logger";

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
  // Clubkonnect-style: UserID → username_encrypted, APIKey → api_key_encrypted
  "userid_apikey",
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

    // Persist result so the execution engine's eligibility check stays in sync.
    // isProviderEligible() filters out providers with health_status = "unhealthy",
    // so a passing health check must clear that flag — and a failing one must set it.
    updateProviderConfig(providerCode, {
      health_status: result.healthy ? "healthy" : "unhealthy",
    }).catch((err: Error) =>
      logger.warn("health_check_status_persist_failed", {
        provider: providerCode,
        error:    err.message,
      })
    );

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

// ── POST /admin/providers/:providerCode/credential-diagnostic ─────────────────
//
// Clubkonnect-specific: loads credentials, logs lengths, calls /APIWalletBalanceV1.asp
// and returns a structured result. The APIKey is never returned or logged in full.

const CK_DIAGNOSTIC_BASE_URL = "https://www.nellobytesystems.com";

export async function credentialDiagnosticController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { providerCode } = req.params;

    if (providerCode !== "clubkonnect") {
      res.status(400).json({ success: false, message: "Credential diagnostic is only supported for Clubkonnect." });
      return;
    }

    // 1. Load credentials
    const creds = await getProviderCredentials(providerCode);

    const userId  = (creds?.username_encrypted ?? "").trim();
    const apiKey  = (creds?.api_key_encrypted  ?? "").trim();
    const baseUrl = ((creds?.base_url ?? "").trim().replace(/\/$/, "")) || CK_DIAGNOSTIC_BASE_URL;

    // 2. Log lengths (never the actual values)
    logger.info("clubkonnect_credential_diagnostic_start", {
      has_credentials: Boolean(creds),
      userId_length:   userId.length,
      apiKey_length:   apiKey.length,
      baseUrl,
    });

    if (!creds) {
      res.status(200).json({
        success: true,
        data: {
          valid: false,
          message: "No credentials found. Add UserID and APIKey in Admin > API Integrations > Clubkonnect.",
          details: { userId_length: 0, apiKey_length: 0, baseUrl },
        },
      });
      return;
    }

    if (!userId) {
      res.status(200).json({
        success: true,
        data: {
          valid: false,
          message: "UserID is missing. Set it in Admin > API Integrations > Clubkonnect.",
          details: { userId_length: 0, apiKey_length: apiKey.length, baseUrl },
        },
      });
      return;
    }

    if (!apiKey) {
      res.status(200).json({
        success: true,
        data: {
          valid: false,
          message: "APIKey is missing. Set it in Admin > API Integrations > Clubkonnect.",
          details: { userId_length: userId.length, apiKey_length: 0, baseUrl },
        },
      });
      return;
    }

    // 3. Call balance endpoint
    const urlObj = new URL(`${baseUrl}/APIWalletBalanceV1.asp`);
    urlObj.searchParams.set("UserID", userId);
    urlObj.searchParams.set("APIKey", apiKey);

    let httpStatus = 0;
    let rawBody    = "";
    let rawJson: Record<string, unknown> | null = null;

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(urlObj.toString(), { method: "GET", signal: controller.signal });
      httpStatus = response.status;
      rawBody    = await response.text();
      try { rawJson = JSON.parse(rawBody); } catch { /* non-JSON body */ }
    } catch (fetchErr) {
      clearTimeout(abortTimer);
      const msg = (fetchErr as Error).name === "AbortError"
        ? "Request to Clubkonnect timed out after 15 seconds."
        : `Network error connecting to Clubkonnect: ${(fetchErr as Error).message}`;
      logger.warn("clubkonnect_credential_diagnostic_fetch_failed", { error: msg });
      res.status(200).json({
        success: true,
        data: {
          valid: false,
          message: msg,
          details: { userId_length: userId.length, apiKey_length: apiKey.length, baseUrl, http_status: 0 },
        },
      });
      return;
    }
    clearTimeout(abortTimer);

    const rawStatus    = String(rawJson?.status ?? "").toUpperCase();
    const responseKeys = rawJson ? Object.keys(rawJson) : [];

    // Log full raw response (APIKey is not present in the response body)
    logger.info("clubkonnect_credential_diagnostic_response", {
      endpoint:      "/APIWalletBalanceV1.asp",
      http_status:   httpStatus,
      raw_status:    rawJson?.status,
      response_keys: responseKeys,
      raw:           rawJson,
    });

    // 4. Authentication failure — do not attempt balance parse
    if (
      rawStatus.startsWith("AUTHENTICATION_FAILED") ||
      rawStatus === "INVALID_KEY"    ||
      rawStatus === "INVALID_USERID" ||
      rawStatus === "MISSING_USERID" ||
      rawStatus === "MISSING_APIKEY"
    ) {
      res.status(200).json({
        success: true,
        data: {
          valid: false,
          message: "Clubkonnect rejected UserID/APIKey. Re-save credentials in Admin.",
          details: {
            userId_length: userId.length,
            apiKey_length: apiKey.length,
            baseUrl,
            raw_status:  rawJson?.status,
            http_status: httpStatus,
          },
        },
      });
      return;
    }

    // HTTP-level failure (e.g. 404 wrong base URL, 500)
    if (httpStatus !== 200) {
      res.status(200).json({
        success: true,
        data: {
          valid: false,
          message: `Clubkonnect returned HTTP ${httpStatus}. Verify base URL: ${baseUrl}`,
          details: {
            userId_length: userId.length,
            apiKey_length: apiKey.length,
            baseUrl,
            raw_status:   rawJson?.status,
            http_status:  httpStatus,
            body_preview: rawBody.slice(0, 200),
          },
        },
      });
      return;
    }

    // 5. Resolve balance from all known field names (Clubkonnect varies by account tier)
    const BALANCE_FIELDS = [
      "balance", "walletbalance", "wallet_balance",
      "WalletBalance", "AvailableBalance", "available_balance", "amount",
    ] as const;

    let balanceFieldFound: string | undefined;
    let rawBalanceValue:   unknown;

    for (const field of BALANCE_FIELDS) {
      if (rawJson && field in rawJson && rawJson[field] !== undefined && rawJson[field] !== null) {
        balanceFieldFound = field;
        rawBalanceValue   = rawJson[field];
        break;
      }
    }

    if (balanceFieldFound === undefined) {
      res.status(200).json({
        success: true,
        data: {
          valid: false,
          message: "Unable to parse Clubkonnect balance — no recognized balance field in response.",
          details: {
            userId_length:  userId.length,
            apiKey_length:  apiKey.length,
            baseUrl,
            raw_status:     rawJson?.status,
            http_status:    httpStatus,
            response_keys:  responseKeys,
          },
        },
      });
      return;
    }

    const balanceStr = String(rawBalanceValue).replace(/,/g, "");
    const balanceNum = parseFloat(balanceStr);

    if (!isNaN(balanceNum)) {
      res.status(200).json({
        success: true,
        data: {
          valid: true,
          message: `Credentials valid. Balance: ₦${balanceNum.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`,
          details: {
            userId_length:       userId.length,
            apiKey_length:       apiKey.length,
            baseUrl,
            balance:             balanceNum,
            balance_field_used:  balanceFieldFound,
            raw_status:          rawJson?.status,
            http_status:         httpStatus,
          },
        },
      });
      return;
    }

    // HTTP 200, balance field found but value is not numeric
    res.status(200).json({
      success: true,
      data: {
        valid: false,
        message: `Unable to parse Clubkonnect balance — field "${balanceFieldFound}" = "${rawBalanceValue}" is not numeric.`,
        details: {
          userId_length:  userId.length,
          apiKey_length:  apiKey.length,
          baseUrl,
          raw_status:     rawJson?.status,
          http_status:    httpStatus,
          response_keys:  responseKeys,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/providers/:providerCode/plans ──────────────────────────────────
//
// Fetches available plans for a given provider.
// ?service=data|cable_tv            (required)
// ?network=mtn|airtel|glo|9mobile   (required when service=data)
//
// Supported providerCode values: legitdataway, smshika

export async function fetchProviderPlansController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { providerCode } = req.params;
    const service = req.query.service as string | undefined;
    const network = req.query.network as string | undefined;

    if (service !== "data" && service !== "cable_tv" && service !== "electricity") {
      res.status(400).json({
        success: false,
        message: "Query param 'service' must be 'data', 'cable_tv', or 'electricity'",
      });
      return;
    }

    if (service === "data" && !network) {
      res.status(400).json({
        success: false,
        message: "Query param 'network' is required when service=data (mtn|airtel|glo|9mobile)",
      });
      return;
    }

    let provider: { fetchPlans(service: "data" | "cable_tv" | "electricity", network?: string): Promise<Array<Record<string, unknown>>> };
    if (providerCode === "legitdataway") {
      provider = new LegitDataWayProvider();
    } else if (providerCode === "smshika") {
      provider = new SmshikaProvider();
    } else {
      res.status(400).json({
        success: false,
        message: `Provider '${providerCode}' does not support plan import. Supported: legitdataway, smshika`,
      });
      return;
    }

    let plans: Array<Record<string, unknown>>;
    try {
      plans = await provider.fetchPlans(service, network);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ success: false, message: msg });
      return;
    }

    res.status(200).json({ success: true, data: { service, network: network ?? null, plans } });
  } catch (err) {
    next(err);
  }
}
