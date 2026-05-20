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

const SMSHIKA_TIMEOUT_MS = 30_000;

// ── Operator mapping ──────────────────────────────────────────────────────────
//
// Internal variation_code values (e.g. "mtn-airtime", "mtn") → SMShika network names.
// Ported_number is sent as false; SMShika routes based on the supplied network name.

const NETWORK_MAP: Record<string, string> = {
  mtn:      "MTN",
  airtel:   "Airtel",
  glo:      "Glo",
  "9mobile": "9mobile",
  etisalat: "9mobile",    // legacy alias
};

// ── SMShika response shapes ───────────────────────────────────────────────────

interface SmshikaTopupResponse {
  Status?:        string;   // "successful" | "fail"
  status?:        string;   // "success"    | "fail"
  message?:       string;
  api_response?:  { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the network prefix from a variation_code.
 * Accepts "mtn-airtime", "mtn", "airtel-airtime", "9mobile-airtime", etc.
 */
function resolveNetwork(variationCode: string): string | null {
  const prefix = variationCode.split("-")[0].toLowerCase();
  return NETWORK_MAP[prefix] ?? null;
}

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 5) return "***";
  return `${phone.slice(0, 5)}${"*".repeat(phone.length - 5)}`;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class SmshikaProvider extends HttpVTUProvider {
  readonly name = "smshika";

  constructor() {
    super("smshika");
  }

  // ── HTTP primitives ───────────────────────────────────────────────────────

  private async fetchWithTimeout(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    },
    timeoutMs = SMSHIKA_TIMEOUT_MS
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
        throw new Error(`SMShika request timed out after ${timeoutMs}ms [${url}]`);
      }
      throw new Error(`SMShika network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`SMShika: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `SMShika: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(0, 200)}`
      );
    }
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    if (input.service_type !== "airtime") {
      // TODO: implement data/cable/electricity when SMShika endpoints are documented
      throw new Error(
        `SMShika: service_type '${input.service_type}' not implemented. Only 'airtime' is supported.`
      );
    }

    const creds = await this.requireCredentials();

    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey) {
      throw new Error("SMShika: api_key not set — add it in Admin > API Integrations > SMShika");
    }
    if (!baseUrl) {
      throw new Error("SMShika: base_url not set — add it in Admin > API Integrations > SMShika");
    }

    const variationCode = input.variation_code ?? "";
    const network = resolveNetwork(variationCode);

    if (!network) {
      throw new Error(
        `SMShika: cannot resolve network for variation_code '${variationCode}'. ` +
        `Expected prefix: mtn | airtel | glo | 9mobile`
      );
    }

    const payload = {
      amount:        String(input.amount),
      network,
      mobile_number: input.phone ?? "",
      Ported_number: false,
      airtime_type:  "VTU",
    };

    console.log("[SMSHIKA] purchase →", {
      network,
      amount:    input.amount,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    const url      = `${baseUrl}/api/topup`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `SMShika: HTTP ${response.status} authentication failure — verify api_key in Admin > API Integrations > SMShika`
      );
    }

    // Parse response body regardless of HTTP status — SMShika returns failure
    // details in the JSON body even on non-2xx codes.
    const raw = await this.parseJson<SmshikaTopupResponse>(response, "topup");

    const isSuccess = raw.status === "success" || raw.Status === "successful";

    console.log("[SMSHIKA] purchase ←", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Airtime purchase successful" : "Airtime purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       {
        status:         raw.status,
        Status:         raw.Status,
        message:        raw.message,
        api_response:   raw.api_response,
        balance_before: raw.balance_before,
        balance_after:  raw.balance_after,
      },
    };
  }

  // SMShika does not expose a transaction verify / requery endpoint in the
  // available documentation.  Return a safe result so callers can handle it.
  // TODO: update if SMShika adds a transaction query endpoint.
  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    console.warn("[SMSHIKA] verifyTransaction called but no query endpoint is documented", { reference });
    return {
      found:   false,
      status:  "pending",
      message: "SMShika does not support transaction verification — check SMShika dashboard",
    };
  }

  // TODO: update if SMShika adds a balance endpoint.
  async getBalance(): Promise<ProviderBalance> {
    throw new Error(
      "SMShika: balance endpoint not available — no balance API is documented for this provider"
    );
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    // Use getProviderCredentials directly so we can return a safe result
    // rather than throw when credentials are absent.
    const creds = await getProviderCredentials(this.name);

    if (!creds) {
      return {
        healthy: false,
        message: "SMShika credentials not configured — add base_url and api_key in Admin > API Integrations",
      };
    }
    if (!creds.api_key_encrypted) {
      return {
        healthy: false,
        message: "SMShika api_key not set — add in Admin > API Integrations > SMShika",
      };
    }
    if (!creds.base_url) {
      return {
        healthy: false,
        message: "SMShika base_url not set — add in Admin > API Integrations > SMShika",
      };
    }

    // No unauthenticated ping endpoint is available; report credentials present.
    // A live connectivity test would require a real topup (not safe for health checks).
    return {
      healthy: true,
      message: "SMShika credentials configured (no live ping — SMShika has no balance/ping endpoint)",
    };
  }
}
