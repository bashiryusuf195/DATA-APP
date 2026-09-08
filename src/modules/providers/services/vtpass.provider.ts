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
import { getProviderCredentials } from "./provider-credentials.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const VTPASS_TIMEOUT_MS = 30_000;

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
  pins?: Array<{ pin: string; serial?: string }>;
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
  code?: string;
  balance?: string | number;
  balance_details?: { balance?: string | number; bonus_balance?: string | number };
  contents?: { balance?: string | number };
  data?: { balance?: string | number };
}

interface VTPassMerchantVerifyResponse {
  code: string;
  content?: {
    Customer_Name?: string;
    Address?: string;
    MeterNumber?: string;
    Customer_Arrears?: string;
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

interface VTPassCreds {
  baseUrl:   string;
  apiKey:    string;
  publicKey: string;
  secretKey: string;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class VTPassProvider extends HttpVTUProvider {
  readonly name = "vtpass";

  constructor() {
    super("vtpass");
  }

  // ── Credential loading (DB-backed, same pattern as SMShika/eData) ─────────
  //
  // ...public_key...

  private async loadCreds(): Promise<VTPassCreds> {
  const creds = await this.requireCredentials();

  const baseUrl   = creds.base_url ?? "";
  const apiKey    = creds.api_key_encrypted ?? "";
  const secretKey = creds.secret_key_encrypted ?? "";
  const publicKey = creds.public_key_encrypted ?? "";   // ← was reading metadata.public_key

  const missing: string[] = [];
  if (!baseUrl)   missing.push("base_url");
  if (!apiKey)    missing.push("api_key");
  if (!secretKey) missing.push("secret_key");
  if (!publicKey) missing.push("public_key");           // ← simplified message

  if (missing.length > 0) {
    throw new Error(
      `VTPass: credentials not fully configured — missing: ${missing.join(", ")}. ` +
      `Add them in Admin > API Integrations > VTPass.`
    );
  }

  return { baseUrl, apiKey, publicKey, secretKey };
  }

  // ── Auth headers ──────────────────────────────────────────────────────────
  //
  // VTPass REST API authentication (from official docs):
  //   GET  /balance                        → api-key + public-key  (readHeaders)
  //   POST /pay, /requery, /merchant-verify → api-key + secret-key (writeHeaders)

  // VTPass requires the first 8 characters of request_id to be today's date (YYYYMMDD).
  // Our internal references are "DAT-20260611-XXXXXX" — strip the prefix so VTPass gets "20260611-XXXXXX".
  private vtpassRequestId(ref: string): string {
    const now = new Date();

    // Africa/Lagos is UTC+1 and has no daylight saving time.
    const lagos = new Date(now.getTime() + 60 * 60 * 1000);

    const yyyy = lagos.getUTCFullYear();
    const mm = String(lagos.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(lagos.getUTCDate()).padStart(2, "0");
    const hh = String(lagos.getUTCHours()).padStart(2, "0");
    const min = String(lagos.getUTCMinutes()).padStart(2, "0");

    const prefix = `${yyyy}${mm}${dd}${hh}${min}`;
    const cleanRef = ref.replace(/[^A-Za-z0-9]/g, "").slice(-18);

    return `${prefix}${cleanRef}`;
  }

  private readHeaders(creds: VTPassCreds): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "api-key": creds.apiKey,
      "public-key": creds.publicKey,
    };
  }

  private writeHeaders(creds: VTPassCreds): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "api-key": creds.apiKey,
      "secret-key": creds.secretKey,
    };
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
    const NETWORK_MAP: Record<string, string> = { "9mobile": "etisalat" };
    const raw     = input.network_operator ?? input.variation_code ?? "";
    const base    = raw.split("-")[0].toLowerCase();
    const network = NETWORK_MAP[base] ?? base;
    if (!network) {
      throw new Error(
        "VTPass airtime requires network_operator or variation_code (mtn | glo | airtel | etisalat)"
      );
    }
    return {
      request_id: this.vtpassRequestId(input.reference),
      serviceID:  network,
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
    const NETWORK_MAP: Record<string, string> = { "9mobile": "etisalat" };
    const base    = input.network_operator.replace(/-data$/i, "").toLowerCase();
    const network = NETWORK_MAP[base] ?? base;
    return {
      request_id:     this.vtpassRequestId(input.reference),
      serviceID:      `${network}-data`,
      billersCode:    input.phone,
      variation_code: variationCode,
      amount:         input.amount,
      phone:          input.phone,
    };
  }

  private buildCableTvPayload(input: ProviderPurchaseInput): Record<string, unknown> {
    if (!input.network_operator) {
      throw new Error(
        "VTPass cable TV purchase requires network_operator (dstv | gotv | startimes)"
      );
    }
    if (!input.smartcard_number) {
      throw new Error("VTPass cable TV purchase requires smartcard_number (IUC number)");
    }
    const variationCode = input.provider_variation_code ?? input.variation_code;
    if (!variationCode) {
      throw new Error("VTPass cable TV purchase requires variation_code (subscription package)");
    }
    return {
      request_id:        this.vtpassRequestId(input.reference),
      serviceID:         input.network_operator,
      billersCode:       input.smartcard_number,
      variation_code:    variationCode,
      amount:            input.amount,
      phone:             input.phone,
      subscription_type: "change",
      quantity:          1,
    };
  }

  private buildElectricityPayload(input: ProviderPurchaseInput): Record<string, unknown> {
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
      request_id:     this.vtpassRequestId(input.reference),
      serviceID:      input.network_operator,
      billersCode:    input.meter_number,
      variation_code: meterType,
      amount:         input.amount,
      phone:          input.phone,
    };
  }

  private buildExamPinPayload(input: ProviderPurchaseInput): Record<string, unknown> {
    if (!input.network_operator) {
      throw new Error(
        "VTPass exam pin purchase requires network_operator (waec | waec-registration | jamb)"
      );
    }
    if (!input.variation_code) {
      throw new Error("VTPass exam pin purchase requires variation_code");
    }
    return {
      request_id:     this.vtpassRequestId(input.reference),
      serviceID:      input.network_operator,
      billersCode:    input.phone,
      variation_code: input.provider_variation_code ?? input.variation_code,
      amount:         input.amount,
      phone:          input.phone,
      quantity:       1,
    };
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    const creds = await this.loadCreds();

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
      service:        input.service_type,
      serviceID:      payload["serviceID"],
      variation_code: payload["variation_code"] ?? "(none — airtime)",
      amount:         input.amount,
      phone:          maskPhone(input.phone),
      reference:      input.reference,
    });

    const url      = `${creds.baseUrl}/pay`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.writeHeaders(creds),
      body:    JSON.stringify(payload),
    });

    if (response.status === 401) {
      throw new Error(
        "VTPass: HTTP 401 authentication failure on /pay — verify api_key and secret_key in Admin > API Integrations > VTPass."
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
    const creds = await this.loadCreds();

    console.log("[VTPASS] requery →", { reference });

    const url      = `${creds.baseUrl}/requery`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.writeHeaders(creds),
      body:    JSON.stringify({ request_id: this.vtpassRequestId(reference) }),
    });

    if (response.status === 401) {
      throw new Error(
        "VTPass: HTTP 401 authentication failure on /requery — verify api_key in Admin > API Integrations > VTPass."
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
    const creds = await this.loadCreds();

    const url      = `${creds.baseUrl}/balance`;
    const response = await this.fetchWithTimeout(url, {
      method:  "GET",
      headers: this.readHeaders(creds),
    });

    if (response.status === 401) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `VTPass: HTTP 401 on /balance — api-key prefix: ${creds.apiKey.slice(0, 6)}... — VTPass said: ${body.slice(0, 300)}`
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`VTPass balance check failed with HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const raw = await this.parseJson<VTPassBalanceResponse>(response, "balance");
    console.log("[VTPASS] balance raw response:", JSON.stringify(raw));

    const balanceValue =
      raw.balance ??
      raw.balance_details?.balance ??
      raw.contents?.balance ??
      raw.data?.balance ??
      0;

    return {
      available:    Number(balanceValue),
      currency:     "NGN",
      raw_response: raw,
    };
  }

  async getServiceVariations(serviceID: string): Promise<unknown> {
    const creds = await this.loadCreds();
    const url      = `${creds.baseUrl}/service-variations?serviceID=${encodeURIComponent(serviceID)}`;
    const response = await this.fetchWithTimeout(url, {
      method:  "GET",
      headers: this.readHeaders(creds),
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(`VTPass /service-variations failed (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`VTPass /service-variations returned non-JSON: ${text.slice(0, 300)}`);
    }
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const creds = await getProviderCredentials(this.name);

    if (!creds) {
      return {
        healthy: false,
        message: "VTPass credentials not configured — add base_url, api_key, secret_key, and metadata.public_key in Admin > API Integrations",
      };
    }
    if (!creds.base_url) {
      return { healthy: false, message: "VTPass base_url not set — add in Admin > API Integrations > VTPass" };
    }
    if (!creds.api_key_encrypted) {
      return { healthy: false, message: "VTPass api_key not set — add in Admin > API Integrations > VTPass" };
    }
    if (!creds.secret_key_encrypted) {
      return { healthy: false, message: "VTPass secret_key not set — add in Admin > API Integrations > VTPass" };
    }
    const publicKey = creds.public_key_encrypted;
    if (!publicKey) {
      return { healthy: false, message: "VTPass public_key not set — add via metadata.public_key in Admin > API Integrations > VTPass" };
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
        return { healthy: false, latency_ms, message: msg };
      }
      if (msg.includes("timed out")) {
        return { healthy: false, latency_ms, message: "VTPass health check timed out — check base_url" };
      }
      if (msg.includes("network error") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
        return { healthy: false, latency_ms, message: "VTPass network unreachable — check base_url" };
      }
      return { healthy: false, latency_ms, message: `VTPass health check failed: ${msg}` };
    }
  }

  // ── Meter verification ────────────────────────────────────────────────────

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    const creds = await this.loadCreds();

    console.log("[VTPASS] verifyMeter →", {
      serviceID:  input.disco_name,
      meterType:  input.meter_type,
      meter:      input.meter_number.slice(0, 4) + "***",
    });

    const url      = `${creds.baseUrl}/merchant-verify`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.writeHeaders(creds),
      body:    JSON.stringify({
        billersCode: input.meter_number,
        serviceID:   input.disco_name,
        type:        input.meter_type,
      }),
    });

    if (response.status === 401) {
      throw new Error("VTPass: HTTP 401 on /merchant-verify — verify api_key in Admin > API Integrations > VTPass.");
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

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    const creds = await this.loadCreds();

    console.log("[VTPASS] verifyCable →", {
      serviceID:   input.biller_code,
      smartcard:   input.smartcard_number.slice(0, 4) + "***",
    });

    const url      = `${creds.baseUrl}/merchant-verify`;
    const response = await this.fetchWithTimeout(url, {
      method:  "POST",
      headers: this.writeHeaders(creds),
      body:    JSON.stringify({
        billersCode: input.smartcard_number,
        serviceID:   input.biller_code,
        type:        "SmartCard",
      }),
    });

    if (response.status === 401) {
      throw new Error("VTPass: HTTP 401 on /merchant-verify — verify api_key in Admin > API Integrations > VTPass.");
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
