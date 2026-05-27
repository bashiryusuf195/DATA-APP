import { HttpVTUProvider } from "./http-vtu.provider";
import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
} from "../types/provider.types";
import { getProviderCredentials } from "./provider-credentials.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskId(s?: string | null): string {
  if (!s || s.length < 5) return "***";
  return `${s.slice(0, 3)}${"*".repeat(s.length - 5)}${s.slice(-2)}`;
}

// Returns true when variation_code represents a NIN product.
function isNinVariation(variationCode: string): boolean {
  return variationCode.startsWith("nin-");
}

// Returns true when variation_code represents a BVN product.
function isBvnVariation(variationCode: string): boolean {
  return variationCode.startsWith("bvn-");
}

// ── Provider response shapes ──────────────────────────────────────────────────
//
// slip_type is our INTERNAL product tier (information / standard / premium for
// NIN; basic for BVN).  It is stored in service_plans.plan_category and drives
// which slip we generate or expose after a successful verification — it is NOT
// forwarded to SecureIDVerify.

interface SecureIDVerifyNINResponse {
  status:     string;
  message?:   string;
  reference?: string;
  data?: {
    nin?:           string;
    first_name?:    string;
    last_name?:     string;
    middle_name?:   string;
    date_of_birth?: string;
    gender?:        string;
    phone?:         string;
    // photo is only present for certain tiers — redacted before DB storage.
    photo?:         string;
    [key: string]:  unknown;
  };
}

interface SecureIDVerifyBVNResponse {
  status:     string;
  message?:   string;
  reference?: string;
  data?: {
    bvn?:           string;
    first_name?:    string;
    last_name?:     string;
    middle_name?:   string;
    date_of_birth?: string;
    gender?:        string;
    phone?:         string;
    [key: string]:  unknown;
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class SecureIDVerifyProvider extends HttpVTUProvider {
  readonly name = "secureidverify";

  constructor() {
    super("secureidverify");
  }

  // ── HTTP primitives ───────────────────────────────────────────────────────

  private async fetchWithTimeout(
    url:      string,
    init:     { method: string; headers: Record<string, string>; body?: string },
    timeoutMs = TIMEOUT_MS,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method:  init.method,
        headers: init.headers,
        body:    init.body,
        signal:  controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`SecureIDVerify request timed out after ${timeoutMs}ms [${url}]`);
      }
      throw new Error(`SecureIDVerify network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`SecureIDVerify: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `SecureIDVerify: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(0, 200)}`
      );
    }
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey) {
      throw new Error(
        "SecureIDVerify: api_key not set — add it in Admin > API Integrations > SecureIDVerify"
      );
    }
    if (!baseUrl) {
      throw new Error(
        "SecureIDVerify: base_url not set — add it in Admin > API Integrations > SecureIDVerify"
      );
    }

    const variationCode = input.variation_code ?? "";

    // id_number (NIN or BVN) is passed through purchase_input.metadata by the
    // vtu-purchase worker — it is NOT a top-level ProviderPurchaseInput field.
    const idNumber = (input.metadata?.id_number as string | undefined) ?? undefined;
    const phone    = input.phone;

    if (isNinVariation(variationCode)) {
      return this.verifyNIN(input, idNumber, phone, apiKey, baseUrl);
    }

    if (isBvnVariation(variationCode)) {
      return this.verifyBVN(input, idNumber, apiKey, baseUrl);
    }

    throw new Error(
      `SecureIDVerify: unknown variation_code '${variationCode}'. ` +
      `Valid codes: nin-information, nin-standard, nin-premium, bvn-basic`
    );
  }

  // ── NIN verification ──────────────────────────────────────────────────────
  //
  // Provider API: POST /v1/verification/nin-verify
  //   verify_method: "nin"       → id_number is the actual NIN (11 digits)
  //   verify_method: "nin-phone" → identifier is a Nigerian phone number
  //
  // slip_type (information / standard / premium) is an INTERNAL product tier
  // stored in plan_category.  It is intentionally NOT forwarded to the provider.

  private async verifyNIN(
    input:    ProviderPurchaseInput,
    idNumber: string | undefined,
    phone:    string | undefined,
    apiKey:   string,
    baseUrl:  string,
  ): Promise<ProviderPurchaseResult> {
    if (!idNumber && !phone) {
      throw new Error(
        "SecureIDVerify NIN: NIN number or phone number is required"
      );
    }

    // Prefer direct NIN lookup; fall back to phone-based lookup.
    const byNin  = !!idNumber;
    const verifyMethod = byNin ? "nin" : "nin-phone";
    const identifier   = byNin ? idNumber! : phone!;

    const payload: Record<string, unknown> = {
      verify_method: verifyMethod,
      identifier,
      isConsent: true,
    };

    console.log("[SECUREIDVERIFY] NIN verify →", {
      verify_method: verifyMethod,
      identifier:    maskId(identifier),
      reference:     input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/v1/verification/nin-verify`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `SecureIDVerify NIN: HTTP ${response.status} authentication failure — verify api_key`
      );
    }

    const raw = await this.parseJson<SecureIDVerifyNINResponse>(response, "NIN verify");
    const isSuccess = (raw.status ?? "").toLowerCase() === "success";

    console.log("[SECUREIDVERIFY] NIN verify ←", {
      status:    raw.status,
      has_data:  !!raw.data,
      reference: input.reference,
    });

    // Redact photo (may be a base64 blob) and mask PII before DB storage.
    const safeResponse: Record<string, unknown> = {
      status:    raw.status,
      message:   raw.message,
      reference: raw.reference,
      data: raw.data
        ? {
            ...raw.data,
            photo:  raw.data.photo  ? "[photo_redacted]"    : undefined,
            nin:    raw.data.nin    ? maskId(raw.data.nin)   : undefined,
            phone:  raw.data.phone  ? maskId(raw.data.phone) : undefined,
          }
        : undefined,
    };

    return {
      success:            isSuccess,
      provider_reference: raw.reference ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "NIN verification successful" : "NIN verification failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       safeResponse,
      // Unmasked data for PDF generation — not stored in raw_response.
      // Spread all raw.data fields so slip-specific fields (tracking_id,
      // residence_state, birth_state, etc.) flow through to the report controller.
      report_data: isSuccess && raw.data ? {
        id_type: "nin",
        ...raw.data,            // all fields from provider (unmasked)
        id_number: raw.data.nin, // normalised alias
        photo:     raw.data.photo, // base64 — excluded from raw_response above
      } : undefined,
    };
  }

  // ── BVN verification ──────────────────────────────────────────────────────
  //
  // Provider API: POST /v1/verification/bvn-verify
  //   bvn:       the subject's 11-digit BVN
  //   isConsent: true (platform consent on behalf of the user)
  //
  // BVN-by-phone is NOT supported by the documented API.  Callers must supply
  // an id_number (the actual BVN).

  private async verifyBVN(
    input:    ProviderPurchaseInput,
    idNumber: string | undefined,
    apiKey:   string,
    baseUrl:  string,
  ): Promise<ProviderPurchaseResult> {
    if (!idNumber) {
      throw new Error(
        "SecureIDVerify BVN: BVN number is required. " +
        "Phone-based BVN lookup is not supported — supply the 11-digit BVN."
      );
    }

    const payload: Record<string, unknown> = {
      bvn:       idNumber,
      isConsent: true,
    };

    console.log("[SECUREIDVERIFY] BVN verify →", {
      bvn:       maskId(idNumber),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/v1/verification/bvn-verify`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `SecureIDVerify BVN: HTTP ${response.status} authentication failure — verify api_key`
      );
    }

    const raw = await this.parseJson<SecureIDVerifyBVNResponse>(response, "BVN verify");
    const isSuccess = (raw.status ?? "").toLowerCase() === "success";

    console.log("[SECUREIDVERIFY] BVN verify ←", {
      status:    raw.status,
      has_data:  !!raw.data,
      reference: input.reference,
    });

    // Mask BVN and phone before DB storage.
    const safeResponse: Record<string, unknown> = {
      status:    raw.status,
      message:   raw.message,
      reference: raw.reference,
      data: raw.data
        ? {
            ...raw.data,
            bvn:   raw.data.bvn   ? maskId(raw.data.bvn)   : undefined,
            phone: raw.data.phone ? maskId(raw.data.phone) : undefined,
          }
        : undefined,
    };

    return {
      success:            isSuccess,
      provider_reference: raw.reference ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "BVN verification successful" : "BVN verification failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       safeResponse,
      // Unmasked data for PDF generation — not stored in raw_response.
      report_data: isSuccess && raw.data ? {
        id_type:  "bvn",
        ...raw.data,
        id_number: raw.data.bvn,
      } : undefined,
    };
  }

  // ── Unsupported operations ────────────────────────────────────────────────

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    console.warn("[SECUREIDVERIFY] verifyTransaction not supported", { reference });
    return {
      found:   false,
      status:  "pending",
      message: "SecureIDVerify does not support transaction status queries",
    };
  }

  async getBalance(): Promise<ProviderBalance> {
    throw new Error("SecureIDVerify: balance endpoint not available");
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const creds = await getProviderCredentials(this.name);

    if (!creds) {
      return {
        healthy: false,
        message: "SecureIDVerify credentials not configured — add base_url and api_key in Admin > API Integrations",
      };
    }
    if (!creds.api_key_encrypted) {
      return { healthy: false, message: "SecureIDVerify api_key not set — add in Admin > API Integrations > SecureIDVerify" };
    }
    if (!creds.base_url) {
      return { healthy: false, message: "SecureIDVerify base_url not set — add in Admin > API Integrations > SecureIDVerify" };
    }

    return {
      healthy: true,
      message: "SecureIDVerify credentials configured (no live ping — provider has no balance/ping endpoint)",
    };
  }
}
