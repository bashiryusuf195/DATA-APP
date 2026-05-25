import { config } from "../../../config";
import { HttpVTUProvider } from "./http-vtu.provider";
import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
} from "../types/provider.types";

// ── Constants ─────────────────────────────────────────────────────────────────

const VTPASS_TIMEOUT_MS = 15_000;

// VTPass response codes
const CODE_SUCCESS = "000";
const CODE_PENDING = "099";
const AUTH_FAILURE_CODES = new Set(["invalid-login-details", "403", "user-not-found"]);

// ── VTPass response shapes ────────────────────────────────────────────────────

interface VTPassTransaction {
  status: string;
  transactionId: string;
  product_name?: string;
  unique_element?: string;
  amount?: number;
  type?: string;
  phone?: string;
}

interface VTPassPurchaseResponse {
  code: string;
  content?: { transactions?: VTPassTransaction };
  response_description?: string;
  requestId?: string;
  amount?: string;
  purchased_code?: string;
}

interface VTPassBalanceResponse {
  code: string;
  balance?: string | number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 5) return "***";
  return `${phone.slice(0, 4)}${"*".repeat(phone.length - 4)}`;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class VTPassProvider extends HttpVTUProvider {
  readonly name = "vtpass";

  // Only the three values actually sent in API headers are stored.
  // VTPASS_USERNAME / VTPASS_PASSWORD are dashboard credentials (not API auth).
  // VTPASS_PUBLIC_KEY is for client-side SDK integrations, not REST API calls.
  private readonly baseUrl:   string;
  private readonly apiKey:    string;
  private readonly secretKey: string;

  constructor() {
    super("vtpass");
    const v = config.vtpass;
    this.baseUrl   = v.baseUrl;
    this.apiKey    = v.apiKey;
    this.secretKey = v.secretKey;
  }

  // ── Credential validation ─────────────────────────────────────────────────

  /** Returns names of missing env vars for the three used in REST API calls. */
  missingCredentials(): string[] {
    const checks: [string, string][] = [
      ["VTPASS_BASE_URL",   this.baseUrl],
      ["VTPASS_API_KEY",    this.apiKey],
      ["VTPASS_SECRET_KEY", this.secretKey],
    ];
    return checks.filter(([, v]) => !v).map(([k]) => k);
  }

  private assertCredentials(): void {
    const missing = this.missingCredentials();
    if (missing.length > 0) {
      throw new Error(
        `VTPass provider credentials not configured. Missing: ${missing.join(", ")}`
      );
    }
  }

  // ── Auth headers ──────────────────────────────────────────────────────────
  //
  // VTPass REST API authentication (sandbox and production):
  //   GET  /balance  → api-key header only
  //   POST /pay      → api-key + secret-key headers
  //   POST /requery  → api-key header only
  //
  // The Authorization: Basic header is for the VTPass web dashboard login,
  // NOT for API calls. Sending it alongside api-key causes a 401.

  private readHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "api-key":      this.apiKey,
    };
  }

  // Purchase (write) operations additionally require the secret key.
  private writeHeaders(): Record<string, string> {
    return { ...this.readHeaders(), "secret-key": this.secretKey };
  }

  // ── HTTP primitives ───────────────────────────────────────────────────────

  private async fetchWithTimeout(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    timeoutMs = VTPASS_TIMEOUT_MS
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
        throw new Error(`VTPass request timed out after ${timeoutMs}ms [${url}]`);
      }
      throw new Error(`VTPass network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`VTPass: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `VTPass: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(0, 200)}`
      );
    }
  }

  // ── Response normalisation ────────────────────────────────────────────────

  private normalizePurchaseResponse(
    raw: VTPassPurchaseResponse,
    reference: string
  ): ProviderPurchaseResult {
    const txn       = raw.content?.transactions;
    const isSuccess = raw.code === CODE_SUCCESS || txn?.status === "delivered";
    const isPending = raw.code === CODE_PENDING  || txn?.status === "initiated";

    return {
      success:            isSuccess,
      provider_reference: txn?.transactionId ?? reference,
      provider:           this.name,
      message:            raw.response_description ?? (
        isSuccess ? "Transaction successful"
        : isPending ? "Transaction pending"
        : "Transaction failed"
      ),
      status:      isSuccess ? "successful" : isPending ? "processing" : "failed",
      raw_response: raw,
    };
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    this.assertCredentials();

    if (input.service_type !== "airtime") {
      throw new Error(
        `VTPass: service_type '${input.service_type}' not yet implemented. Only 'airtime' is supported.`
      );
    }
    if (!input.variation_code) {
      throw new Error(
        "VTPass airtime purchase requires variation_code (network operator: mtn | glo | airtel | etisalat)"
      );
    }

    const payload = {
      request_id: input.reference,
      serviceID:  input.variation_code,
      amount:     input.amount,
      phone:      input.phone,
    };

    console.log("[VTPASS] purchase →", {
      serviceID: input.variation_code,
      amount:    input.amount,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    const url      = `${this.baseUrl}/pay`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.writeHeaders(),
      body:    JSON.stringify(payload),
    });

    if (response.status === 401) {
      throw new Error(
        "VTPass: HTTP 401 authentication failure on /pay — verify VTPASS_API_KEY and VTPASS_SECRET_KEY."
      );
    }
    if (!response.ok) {
      throw new Error(`VTPass purchase failed with HTTP ${response.status}`);
    }

    const raw = await this.parseJson<VTPassPurchaseResponse>(response, "purchase");

    if (AUTH_FAILURE_CODES.has(raw.code)) {
      throw new Error(`VTPass authentication error: ${raw.response_description ?? raw.code}`);
    }

    console.log("[VTPASS] purchase ←", {
      code:      raw.code,
      txnStatus: raw.content?.transactions?.status,
      reference: input.reference,
    });

    return this.normalizePurchaseResponse(raw, input.reference);
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    this.assertCredentials();

    console.log("[VTPASS] requery →", { reference });

    const url      = `${this.baseUrl}/requery`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.readHeaders(),
      body:    JSON.stringify({ request_id: reference }),
    });

    if (response.status === 401) {
      throw new Error(
        "VTPass: HTTP 401 authentication failure on /requery — verify VTPASS_API_KEY."
      );
    }
    if (!response.ok) {
      throw new Error(`VTPass requery failed with HTTP ${response.status}`);
    }

    const raw = await this.parseJson<VTPassPurchaseResponse>(response, "requery");
    const txn = raw.content?.transactions;

    const isSuccess = raw.code === CODE_SUCCESS || txn?.status === "delivered";
    const isPending = raw.code === CODE_PENDING  || txn?.status === "initiated";

    console.log("[VTPASS] requery ←", {
      code:      raw.code,
      txnStatus: txn?.status,
      reference,
    });

    return {
      found:              !!(txn?.transactionId) || isSuccess,
      status:             isSuccess ? "successful" : isPending ? "pending" : "failed",
      provider_reference: txn?.transactionId,
      message:            raw.response_description ?? "Requery completed",
      raw_response:       raw,
    };
  }

  async getBalance(): Promise<ProviderBalance> {
    this.assertCredentials();

    const url      = `${this.baseUrl}/balance`;
    const response = await this.fetchWithTimeout(url, {
      method:  "GET",
      headers: this.readHeaders(),
    });

    if (response.status === 401) {
      throw new Error(
        "VTPass: HTTP 401 authentication failure on /balance — verify VTPASS_API_KEY."
      );
    }
    if (!response.ok) {
      throw new Error(`VTPass balance check failed with HTTP ${response.status}`);
    }

    const raw = await this.parseJson<VTPassBalanceResponse>(response, "balance");

    return {
      available:    Number(raw.balance ?? 0),
      currency:     "NGN",
      raw_response: raw,
    };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    // 1. Missing env vars — no HTTP call made.
    const missing = this.missingCredentials();
    if (missing.length > 0) {
      return {
        healthy: false,
        message: `VTPass not configured — missing env vars: ${missing.join(", ")}`,
      };
    }

    // 2. Attempt balance check as a live ping.
    const start = Date.now();
    try {
      await this.getBalance();
      return {
        healthy:    true,
        latency_ms: Date.now() - start,
        message:    "VTPass reachable and credentials valid",
      };
    } catch (err) {
      const msg        = (err as Error).message ?? String(err);
      const latency_ms = Date.now() - start;

      // 3. Authentication failure (HTTP 401).
      if (msg.includes("401")) {
        return {
          healthy:    false,
          latency_ms,
          message:    "VTPass authentication failed (HTTP 401) — verify VTPASS_API_KEY in .env",
        };
      }

      // 4. Timeout.
      if (msg.includes("timed out")) {
        return {
          healthy:    false,
          latency_ms,
          message:    `VTPass health check timed out — check VTPASS_BASE_URL or network connectivity`,
        };
      }

      // 5. Network / DNS failure.
      if (msg.includes("network error") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
        return {
          healthy:    false,
          latency_ms,
          message:    `VTPass network unreachable — check VTPASS_BASE_URL and internet connectivity`,
        };
      }

      // 6. Any other failure.
      return {
        healthy:    false,
        latency_ms,
        message:    `VTPass health check failed: ${msg}`,
      };
    }
  }
}
