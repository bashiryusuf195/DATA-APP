import { config } from "../../../config";
import { HttpVTUProvider } from "./http-vtu.provider";
import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
  MeterVerifyInput,
  MeterVerifyResult,
  CableVerifyInput,
  CableVerifyResult,
} from "../types/provider.types";

// ── Constants ─────────────────────────────────────────────────────────────────

const VTPASS_TIMEOUT_MS = 15_000;

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
  // Exam pin delivery
  pins?: Array<{ pin: string; serial?: string }>;
}

interface VTPassPurchaseResponse {
  code: string;
  content?: { transactions?: VTPassTransaction };
  response_description?: string;
  requestId?: string;
  amount?: string;
  // Exam pin: single pin returned here
  purchased_code?: string;
}

interface VTPassBalanceResponse {
  code: string;
  balance?: string | number;
}

// Merchant verify covers both meter and cable TV — fields differ per service.
interface VTPassMerchantVerifyResponse {
  code: string;
  content?: {
    // Electricity meter fields
    Customer_Name?: string;
    Address?: string;
    MeterNumber?: string;
    Customer_Arrears?: string;
    // Cable TV fields
    Status?: string;
    Due_Date?: string;
    Current_Bouquet?: string;
    smartcard_number?: string;
  };
  response_description?: string;
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
  //   GET  /balance         → api-key header only
  //   POST /pay             → api-key + secret-key headers
  //   POST /requery         → api-key header only
  //   POST /merchant-verify → api-key header only
  //
  // Authorization: Basic is for the VTPass web dashboard only — NOT for API calls.

  private readHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "api-key":      this.apiKey,
    };
  }

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
      status:       isSuccess ? "successful" : isPending ? "processing" : "failed",
      raw_response: raw,
    };
  }

  // ── Service-type payload builders ─────────────────────────────────────────

  private buildAirtimePayload(input: ProviderPurchaseInput): Record<string, unknown> {
    if (!input.variation_code) {
      throw new Error(
        "VTPass airtime requires variation_code (network: mtn | glo | airtel | etisalat)"
      );
    }
    return {
      request_id: input.reference,
      serviceID:  input.variation_code,   // e.g. "mtn"
      amount:     input.amount,
      phone:      input.phone,
    };
  }

  private buildDataPayload(input: ProviderPurchaseInput): Record<string, unknown> {
    if (!input.network_operator) {
      throw new Error(
        "VTPass data purchase requires network_operator (mtn | glo | airtel | etisalat)"
      );
    }
    const variationCode = input.provider_variation_code ?? input.variation_code;
    if (!variationCode) {
      throw new Error("VTPass data purchase requires variation_code (data plan code)");
    }
    return {
      request_id:     input.reference,
      serviceID:      `${input.network_operator}-data`,  // e.g. "mtn-data"
      billersCode:    input.phone,
      variation_code: variationCode,
      amount:         input.amount,
      phone:          input.phone,
    };
  }

  private buildCableTvPayload(input: ProviderPurchaseInput): Record<string, unknown> {
    // network_operator = "dstv" | "gotv" | "startimes"
    if (!input.network_operator) {
      throw new Error(
        "VTPass cable TV purchase requires network_operator (dstv | gotv | startimes)"
      );
    }
    if (!input.smartcard_number) {
      throw new Error("VTPass cable TV purchase requires smartcard_number (IUC number)");
    }
    if (!input.variation_code) {
      throw new Error("VTPass cable TV purchase requires variation_code (subscription package)");
    }
    return {
      request_id:        input.reference,
      serviceID:         input.network_operator,       // e.g. "dstv"
      billersCode:       input.smartcard_number,
      variation_code:    input.variation_code,
      amount:            input.amount,
      phone:             input.phone,
      subscription_type: "renew",
      quantity:          1,
    };
  }

  private buildElectricityPayload(input: ProviderPurchaseInput): Record<string, unknown> {
    // network_operator = disco serviceID, e.g. "ikeja-electric"
    if (!input.network_operator) {
      throw new Error(
        "VTPass electricity purchase requires network_operator (disco service ID, e.g. ikeja-electric)"
      );
    }
    if (!input.meter_number) {
      throw new Error("VTPass electricity purchase requires meter_number");
    }
    const meterType = input.plan_category ?? input.variation_code ?? "prepaid";
    return {
      request_id:     input.reference,
      serviceID:      input.network_operator,          // e.g. "ikeja-electric"
      billersCode:    input.meter_number,
      variation_code: meterType,                       // "prepaid" | "postpaid"
      amount:         input.amount,
      phone:          input.phone,
    };
  }

  private buildExamPinPayload(input: ProviderPurchaseInput): Record<string, unknown> {
    // network_operator = "waec" | "waec-registration" | "jamb"
    if (!input.network_operator) {
      throw new Error(
        "VTPass exam pin purchase requires network_operator (waec | waec-registration | jamb)"
      );
    }
    if (!input.variation_code) {
      throw new Error("VTPass exam pin purchase requires variation_code");
    }
    return {
      request_id:     input.reference,
      serviceID:      input.network_operator,
      billersCode:    input.phone,
      variation_code: input.variation_code,
      amount:         input.amount,
      phone:          input.phone,
      quantity:       1,
    };
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    this.assertCredentials();

    let payload: Record<string, unknown>;

    switch (input.service_type) {
      case "airtime":
        payload = this.buildAirtimePayload(input);
        break;
      case "data":
        payload = this.buildDataPayload(input);
        break;
      case "cable_tv":
        payload = this.buildCableTvPayload(input);
        break;
      case "electricity":
        payload = this.buildElectricityPayload(input);
        break;
      case "exam_pin":
        payload = this.buildExamPinPayload(input);
        break;
      default:
        throw new Error(
          `VTPass: service_type '${input.service_type}' is not supported. ` +
          `Supported: airtime | data | cable_tv | electricity | exam_pin`
        );
    }

    console.log("[VTPASS] purchase →", {
      service:   input.service_type,
      serviceID: payload["serviceID"],
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
    const missing = this.missingCredentials();
    if (missing.length > 0) {
      return {
        healthy: false,
        message: `VTPass not configured — missing env vars: ${missing.join(", ")}`,
      };
    }

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

      if (msg.includes("401")) {
        return { healthy: false, latency_ms, message: "VTPass authentication failed (HTTP 401) — verify VTPASS_API_KEY" };
      }
      if (msg.includes("timed out")) {
        return { healthy: false, latency_ms, message: "VTPass health check timed out — check VTPASS_BASE_URL" };
      }
      if (msg.includes("network error") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
        return { healthy: false, latency_ms, message: "VTPass network unreachable — check VTPASS_BASE_URL" };
      }
      return { healthy: false, latency_ms, message: `VTPass health check failed: ${msg}` };
    }
  }

  // ── Meter verification ────────────────────────────────────────────────────
  //
  // VTPass /merchant-verify for electricity:
  //   disco_name = serviceID (e.g. "ikeja-electric")
  //   meter_type = "prepaid" | "postpaid"

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    this.assertCredentials();

    console.log("[VTPASS] verifyMeter →", {
      serviceID:  input.disco_name,
      meterType:  input.meter_type,
      meter:      input.meter_number.slice(0, 4) + "***",
    });

    const url      = `${this.baseUrl}/merchant-verify`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.readHeaders(),
      body:    JSON.stringify({
        billersCode: input.meter_number,
        serviceID:   input.disco_name,
        type:        input.meter_type,
      }),
    });

    if (response.status === 401) {
      throw new Error("VTPass: HTTP 401 on /merchant-verify — verify VTPASS_API_KEY.");
    }
    if (!response.ok) {
      throw new Error(`VTPass meter verify failed with HTTP ${response.status}`);
    }

    const raw = await this.parseJson<VTPassMerchantVerifyResponse>(response, "merchant-verify");

    if (raw.code !== CODE_SUCCESS) {
      return {
        success:      false,
        customer_name: "",
        meter_number: input.meter_number,
        message:      raw.response_description ?? `Meter verification failed (code: ${raw.code})`,
        raw_response: raw,
      };
    }

    const c = raw.content ?? {};
    return {
      success:       true,
      customer_name: c.Customer_Name ?? "",
      address:       c.Address,
      meter_number:  c.MeterNumber ?? input.meter_number,
      message:       "Meter verified successfully",
      raw_response:  raw,
    };
  }

  // ── Cable TV verification ─────────────────────────────────────────────────
  //
  // VTPass /merchant-verify for cable TV:
  //   biller_code = serviceID (e.g. "dstv" | "gotv" | "startimes")

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    this.assertCredentials();

    console.log("[VTPASS] verifyCable →", {
      serviceID:   input.biller_code,
      smartcard:   input.smartcard_number.slice(0, 4) + "***",
    });

    const url      = `${this.baseUrl}/merchant-verify`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.readHeaders(),
      body:    JSON.stringify({
        billersCode: input.smartcard_number,
        serviceID:   input.biller_code,
        type:        "SmartCard",
      }),
    });

    if (response.status === 401) {
      throw new Error("VTPass: HTTP 401 on /merchant-verify — verify VTPASS_API_KEY.");
    }
    if (!response.ok) {
      throw new Error(`VTPass cable verify failed with HTTP ${response.status}`);
    }

    const raw = await this.parseJson<VTPassMerchantVerifyResponse>(response, "cable-verify");

    if (raw.code !== CODE_SUCCESS) {
      return {
        success:  false,
        message:  raw.response_description ?? `Cable verification failed (code: ${raw.code})`,
        raw_response: raw,
      };
    }

    const c = raw.content ?? {};
    return {
      success:          true,
      customer_name:    c.Customer_Name,
      current_package:  c.Current_Bouquet,
      due_date:         c.Due_Date,
      smartcard_number: c.smartcard_number ?? input.smartcard_number,
      message:          "Smartcard verified successfully",
      raw_response:     raw,
    };
  }
}
