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
import { logger } from "../../../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const CK_TIMEOUT_MS = 30_000;
const CK_DEFAULT_BASE_URL = "https://www.nellobytesystems.com";

// ── Network ID maps ───────────────────────────────────────────────────────────

/** Airtime: MobileNetwork codes (/APIAirtimeV1.asp). */
const AIRTIME_NETWORK_ID_MAP: Record<string, string> = {
  mtn:       "01",
  glo:       "02",
  airtel:    "03",
  "9mobile": "04",
  etisalat:  "04",
};

/** Data bundle: MobileNetwork codes (/APIDatabundleV1.asp — 9mobile=03, Airtel=04). */
const DATA_NETWORK_ID_MAP: Record<string, string> = {
  mtn:       "01",
  glo:       "02",
  "9mobile": "03",
  etisalat:  "03",
  airtel:    "04",
};

// ── Status normalization ──────────────────────────────────────────────────────

const SUCCESSFUL_STATUSES  = new Set(["ORDER_COMPLETED"]);
// TXN_HISTORY = Clubkonnect's query-found status — transaction exists but actual
// outcome is in orderstatus/orderremark. Treated as processing (not failure)
// so the token-extraction logic in verifyTransaction can resolve it to "successful".
const PROCESSING_STATUSES  = new Set(["ORDER_RECEIVED", "ORDER_ONHOLD", "ORDER_PROCESSING", "TXN_HISTORY"]);

/**
 * Maps Clubkonnect status strings and statuscode values to a purchase status.
 *
 * Checks every reliable success indicator — any one is sufficient:
 *   - status/orderstatus === "ORDER_COMPLETED"
 *   - statuscode === "200" or 200
 *   - remark contains "TRANSACTION SUCCESSFUL"
 *
 * ORDER_RECEIVED / ORDER_ONHOLD / ORDER_PROCESSING → "processing" (accepted, delivery pending)
 * Everything else → "failed"
 */
function normalizeStatus(
  status?:      string,
  statuscode?:  string | number,
  remark?:      string,
  orderstatus?: string,
): "successful" | "processing" | "failed" {
  const s   = (status      ?? "").toUpperCase().trim();
  const os  = (orderstatus ?? "").toUpperCase().trim();
  const rem = (remark      ?? "").toUpperCase().trim();
  const code = String(statuscode ?? "").trim();

  if (SUCCESSFUL_STATUSES.has(s) || SUCCESSFUL_STATUSES.has(os))     return "successful";
  if (code === "200" || parseInt(code, 10) === 200)                   return "successful";
  if (rem.includes("TRANSACTION SUCCESSFUL"))                         return "successful";
  if (PROCESSING_STATUSES.has(s) || PROCESSING_STATUSES.has(os))     return "processing";
  return "failed";
}

/** Maps a normalizeStatus result to the VerifyTransactionResult status vocabulary
 *  ("processing" → "pending" since the polling loop uses "pending" for "not yet final"). */
function toVerifyStatus(s: "successful" | "processing" | "failed"): "successful" | "pending" | "failed" {
  return s === "processing" ? "pending" : s;
}

// Converts plan_category or meter_type value to Clubkonnect MeterType code.
// Accepts both human labels ("prepaid"/"postpaid") and numeric codes ("01"/"02").
function toMeterTypeCode(value: string | null | undefined): "01" | "02" {
  if (value === "02" || (value ?? "").toLowerCase() === "postpaid") return "02";
  return "01";
}

// ── Response shapes ───────────────────────────────────────────────────────────

interface CKBaseResponse {
  status?:      string;
  statuscode?:  string | number;
  order_id?:    string;
  orderid?:     string;
  message?:     string;
  remark?:      string;
  orderstatus?: string;
}

interface CKTopupResponse extends CKBaseResponse {
  phone?:          string;
  amount?:         string | number;
  balance?:        string;
  walletbalance?:  string;
  requestid?:      string;
  amountcharged?:  string | number;
}

interface CKDataResponse extends CKBaseResponse {
  phone?:          string;
  plan?:           string | number;
  balance?:        string;
  walletbalance?:  string;
  requestid?:      string;
  amountcharged?:  string | number;
}

interface CKElectricityResponse extends CKBaseResponse {
  token?:         string;
  units?:         string | number;
  meter_number?:  string;
  customer_name?: string;
  address?:       string;
}

interface CKMeterVerifyResponse {
  status?:        string;
  statuscode?:    string | number;
  // Clubkonnect uses different field names across DISCO integrations
  customer_name?: string;
  Customer_Name?: string;
  CustomerName?:  string;
  customerName?:  string;
  customername?:  string;
  name?:          string;
  address?:       string;
  meter_number?:  string;
  message?:       string;
}

interface CKCableVerifyResponse {
  status?:          string;
  statuscode?:      string | number;
  customer_name?:   string;
  current_package?: string;
  package?:         string;
  bouquet?:         string;
  due_date?:        string;
  smartcard_number?: string;
  message?:         string;
}

interface CKCableResponse extends CKBaseResponse {
  customer_name?: string;
  package?:       string;
  bouquet?:       string;
  due_date?:      string;
}

interface CKWaecResponse extends CKBaseResponse {
  pins?:        Array<{ pin?: string; serial?: string; Pin?: string; Serial?: string }>;
  carddetails?: Array<{ pin?: string; serial?: string; Pin?: string; Serial?: string }>;
}

interface CKJambResponse extends CKBaseResponse {
  pin?:         string;
  carddetails?: Array<{ pin?: string; serial?: string; Pin?: string; Serial?: string }>;
}

interface CKBalanceResponse {
  status?:           string;
  statuscode?:       string | number;
  // Clubkonnect balance field — varies by account tier / API version
  balance?:          string | number;
  walletbalance?:    string | number;
  wallet_balance?:   string | number;
  WalletBalance?:    string | number;
  AvailableBalance?: string | number;
  available_balance?: string | number;
  amount?:           string | number;
  message?:          string;
}

interface CKQueryResponse extends CKBaseResponse {
  request_id?:      string;
  orderstatus?:     string;
  orderremark?:     string;
  // Electricity fields present in TXN_HISTORY responses
  token?:           string;
  units?:           string | number;
  customer_name?:   string;
  meter_number?:    string;
  address?:         string;
  electriccompany?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extracts network prefix from internal variation_code (e.g. "mtn-1gb-30" → "mtn"). */
function networkPrefix(variationCode: string): string {
  return variationCode.split("-")[0].toLowerCase();
}

/** Returns OrderID from a CK response (whichever key is present). */
function extractOrderId(raw: CKBaseResponse): string | undefined {
  return raw.order_id ?? raw.orderid ?? undefined;
}

/** Sanitizes a reference for use as ClubKonnect RequestID — strips hyphens, max 20 chars. */
function toRequestId(reference: string): string {
  return reference.replace(/-/g, "").slice(0, 20);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class ClubkonnectProvider extends HttpVTUProvider {
  readonly name = "clubkonnect";

  constructor() {
    super("clubkonnect");
  }

  // ── HTTP primitives ───────────────────────────────────────────────────────

  /**
   * Builds a GET URL with query params.  Never includes APIKey in log output.
   */
  private buildUrl(
    baseUrl: string,
    path: string,
    params: Record<string, string | number | undefined | null>,
  ): string {
    const base = baseUrl.replace(/\/$/, "");
    const url  = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v).length > 0) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  /** Extracts query params as a loggable object, filtering out APIKey. */
  private loggableParams(urlStr: string): Record<string, string> {
    try {
      const parsed: Record<string, string> = {};
      new URL(urlStr).searchParams.forEach((v, k) => {
        if (k.toLowerCase() !== "apikey") parsed[k] = v;
      });
      return parsed;
    } catch {
      return {};
    }
  }

  private async fetchGet(url: string): Promise<Response> {
    let urlPath = "";
    try { urlPath = new URL(url).pathname; } catch { /* ignore */ }

    logger.info("clubkonnect_request", {
      path:   urlPath,
      params: this.loggableParams(url),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CK_TIMEOUT_MS);
    try {
      return await fetch(url, { method: "GET", signal: controller.signal });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`Clubkonnect request timed out after ${CK_TIMEOUT_MS}ms`);
      }
      throw new Error(`Clubkonnect network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`Clubkonnect: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      let urlPath = "";
      try { urlPath = new URL(response.url).pathname; } catch { /* ignore */ }
      logger.warn("clubkonnect_non_json_response", {
        context,
        httpStatus:  response.status,
        urlPath,
        bodyPreview: text.slice(0, 300),
      });
      throw new Error(
        `Clubkonnect: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(0, 200)}`,
      );
    }
  }

  // ── Credential helpers ────────────────────────────────────────────────────
  //
  // Clubkonnect credential field mapping (provider_credentials table):
  //   UserID  ←→  username_encrypted
  //   APIKey  ←→  api_key_encrypted
  //
  // Set up via Admin > API Integrations > Clubkonnect using auth_type "api_key".
  // Do NOT read password_encrypted or secret_key_encrypted for Clubkonnect auth.

  private async resolveClubkonnectAuth(): Promise<{
    userId:  string;
    apiKey:  string;
    baseUrl: string;
  }> {
    const creds = await this.requireCredentials();

    // UserID  ← username_encrypted
    // APIKey  ← api_key_encrypted
    const userId  = (creds.username_encrypted ?? "").trim();
    const apiKey  = (creds.api_key_encrypted  ?? "").trim();
    const baseUrl = ((creds.base_url ?? "").trim().replace(/\/$/, "")) || CK_DEFAULT_BASE_URL;

    if (!userId) {
      throw new Error(
        "Clubkonnect: UserID not set — go to Admin > API Integrations > Clubkonnect " +
        "and fill the UserID field (stored under username / username_encrypted)",
      );
    }
    if (!apiKey) {
      throw new Error(
        "Clubkonnect: APIKey not set — go to Admin > API Integrations > Clubkonnect " +
        "and fill the APIKey field (stored under api_key / api_key_encrypted)",
      );
    }

    logger.info("clubkonnect_credentials_resolved", {
      userId_chars: userId.length,
      apiKey_chars: apiKey.length,
      baseUrl,
    });

    return { userId, apiKey, baseUrl };
  }

  /**
   * Logs a redacted credential snapshot right before a network request.
   * Never logs the full APIKey — only its length and the first 4 chars of UserID.
   */
  private logRequestCredentialCheck(
    service:  string,
    endpoint: string,
    userId:   string,
    apiKey:   string,
  ): void {
    logger.info("clubkonnect_request_credentials_check", {
      service,
      endpoint,
      userIdPresent: Boolean(userId),
      apiKeyPresent: Boolean(apiKey),
      userIdPrefix:  userId ? userId.slice(0, 4) : null,
      apiKeyLength:  apiKey ? apiKey.length : 0,
    });
  }

  /** True when a Clubkonnect status string indicates an authentication / credential problem. */
  private isAuthErrorStatus(status: string | undefined): boolean {
    const s = (status ?? "").toUpperCase();
    return (
      s.startsWith("AUTHENTICATION_FAILED") ||
      s === "INVALID_KEY"          ||
      s === "INVALID_CREDENTIALS"  ||
      s === "MISSING_CREDENTIALS"  ||
      s === "MISSING_USERID"       ||
      s === "MISSING_APIKEY"       ||
      s === "INVALID_USERID"
    );
  }

  /**
   * Emits a warning log when a Clubkonnect JSON response contains an auth error.
   * Call this after parseJson in every service method so auth problems are always visible.
   */
  private warnIfAuthError(
    raw:      { status?: string; statuscode?: string | number; remark?: string; orderstatus?: string; message?: string },
    service:  string,
    endpoint: string,
  ): void {
    if (!this.isAuthErrorStatus(raw.status)) return;
    logger.warn("clubkonnect_auth_error_response", {
      service,
      endpoint,
      statusCode:  raw.statuscode,
      status:      raw.status,
      remark:      raw.remark,
      orderStatus: raw.orderstatus,
      message:     raw.message,
    });
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    const { userId, apiKey, baseUrl } = await this.resolveClubkonnectAuth();
    const auth = { userId, apiKey, baseUrl };

    if (input.service_type === "airtime")     return this.purchaseAirtime(input, auth);
    if (input.service_type === "data")        return this.purchaseData(input, auth);
    if (input.service_type === "electricity") return this.purchaseElectricity(input, auth);
    if (input.service_type === "cable_tv")    return this.purchaseCable(input, auth);
    if (input.service_type === "exam_pin")    return this.purchaseExamPin(input, auth);

    throw new Error(
      `Clubkonnect: service_type '${input.service_type}' not implemented. ` +
      `Supported: airtime, data, electricity, cable_tv, exam_pin.`,
    );
  }

  // ── Airtime ───────────────────────────────────────────────────────────────

  private async purchaseAirtime(
    input: ProviderPurchaseInput,
    auth: { userId: string; apiKey: string; baseUrl: string },
  ): Promise<ProviderPurchaseResult> {
    const prefix    = networkPrefix(input.variation_code ?? "");
    const networkId = AIRTIME_NETWORK_ID_MAP[prefix];

    if (!networkId) {
      throw new Error(
        `Clubkonnect airtime: cannot resolve MobileNetwork for variation_code '${input.variation_code}'. ` +
        `Expected prefix: mtn | glo | airtel | 9mobile`,
      );
    }

    this.logRequestCredentialCheck("airtime", "/APIAirtimeV1.asp", auth.userId, auth.apiKey);

    const url = this.buildUrl(auth.baseUrl, "/APIAirtimeV1.asp", {
      UserID:        auth.userId,
      APIKey:        auth.apiKey,
      MobileNetwork: networkId,
      Amount:        Math.round(input.amount),
      MobileNumber:  input.phone,
      RequestID:     toRequestId(input.reference),
    });

    logger.info("airtime_request_started", {
      reference:  input.reference,
      networkId,
      amount:     Math.round(input.amount),
      endpoint:   "/APIAirtimeV1.asp",
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect airtime: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKTopupResponse>(response, "airtime topup");

    logger.info("airtime_provider_response_received", {
      reference:  input.reference,
      http_status: response.status,
      status:      raw.status,
      statuscode:  raw.statuscode,
      order_id:    extractOrderId(raw),
    });

    this.warnIfAuthError(raw, "airtime", "/APIAirtimeV1.asp");
    const normalized = normalizeStatus(raw.status, raw.statuscode, raw.remark, raw.orderstatus);

    logger.info("airtime_normalization_completed", {
      reference:  input.reference,
      raw_status: raw.status,
      normalized,
    });

    logger.info("clubkonnect_airtime_response", {
      status:      raw.status,
      statuscode:  raw.statuscode,
      orderstatus: raw.orderstatus,
      remark:      raw.remark,
      order_id:    extractOrderId(raw),
      message:     raw.message,
      reference:   input.reference,
      normalized,
    });

    return {
      success:            normalized === "successful",
      provider_reference: extractOrderId(raw) ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (normalized === "successful" ? "Airtime top-up successful" : "Airtime top-up failed"),
      status:             normalized,
      raw_response: {
        status:         raw.status,
        statuscode:     raw.statuscode,
        orderstatus:    raw.orderstatus,
        remark:         raw.remark,
        order_id:       extractOrderId(raw),
        requestid:      raw.requestid,
        message:        raw.message,
        walletbalance:  raw.walletbalance ?? raw.balance,
        amountcharged:  raw.amountcharged,
      },
    };
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  private async purchaseData(
    input: ProviderPurchaseInput,
    auth: { userId: string; apiKey: string; baseUrl: string },
  ): Promise<ProviderPurchaseResult> {
    const planId = input.provider_variation_code ?? null;
    if (!planId) {
      throw new Error(
        "Clubkonnect data: Provider plan ID is missing for this plan. " +
        "Go to Admin → Service Plans, find this data plan, and set " +
        "'Provider Variation Code' to the Clubkonnect data plan ID.",
      );
    }

    const prefix    = networkPrefix(input.variation_code ?? "");
    const networkId = DATA_NETWORK_ID_MAP[prefix];
    if (!networkId) {
      throw new Error(
        `Clubkonnect data: cannot resolve MobileNetwork for variation_code '${input.variation_code}'. ` +
        `Expected prefix: mtn | glo | airtel | 9mobile`,
      );
    }

    this.logRequestCredentialCheck("data", "/APIDatabundleV1.asp", auth.userId, auth.apiKey);

    const url = this.buildUrl(auth.baseUrl, "/APIDatabundleV1.asp", {
      UserID:        auth.userId,
      APIKey:        auth.apiKey,
      MobileNumber:  input.phone,
      DataPlan:      planId,
      MobileNetwork: networkId,
      RequestID:     toRequestId(input.reference),
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect data: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKDataResponse>(response, "data bundle");
    this.warnIfAuthError(raw, "data", "/APIDatabundleV1.asp");
    const normalized = normalizeStatus(raw.status, raw.statuscode, raw.remark, raw.orderstatus);

    logger.info("clubkonnect_data_response", {
      status:      raw.status,
      statuscode:  raw.statuscode,
      orderstatus: raw.orderstatus,
      remark:      raw.remark,
      order_id:    extractOrderId(raw),
      message:     raw.message,
      reference:   input.reference,
      normalized,
    });

    return {
      success:            normalized === "successful",
      provider_reference: extractOrderId(raw) ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (normalized === "successful" ? "Data bundle purchase successful" : "Data bundle purchase failed"),
      status:             normalized,
      raw_response: {
        status:         raw.status,
        statuscode:     raw.statuscode,
        orderstatus:    raw.orderstatus,
        remark:         raw.remark,
        order_id:       extractOrderId(raw),
        requestid:      raw.requestid,
        message:        raw.message,
        walletbalance:  raw.walletbalance ?? raw.balance,
        amountcharged:  raw.amountcharged,
      },
    };
  }

  // ── Electricity ───────────────────────────────────────────────────────────

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    const { userId, apiKey, baseUrl } = await this.resolveClubkonnectAuth();

    if (!input.disco_name) {
      throw new Error(
        "Clubkonnect electricity: disco_name (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the Clubkonnect DISCO ID code " +
        "(01=EKEDC, 02=IKEDC, 03=AEDC, 04=KEDC, 05=PHEDC, 06=JEDC, " +
        "07=IBEDC, 08=KAEDC, 09=EEDC, 10=BEDC, 11=YEDC, 12=ABA/APLE).",
      );
    }

    const meterType = toMeterTypeCode(input.meter_type);

    this.logRequestCredentialCheck("meter_verify", "/APIVerifyElectricityV1.asp", userId, apiKey);

    const url = this.buildUrl(baseUrl, "/APIVerifyElectricityV1.asp", {
      UserID:          userId,
      APIKey:          apiKey,
      ElectricCompany: input.disco_name,
      MeterType:       meterType,
      MeterNo:         input.meter_number,
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect meter verify: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKMeterVerifyResponse>(response, "meter verify");
    this.warnIfAuthError(raw, "meter_verify", "/APIVerifyElectricityV1.asp");

    // Normalize customer name — Clubkonnect uses different field names per DISCO.
    // rawName is used for success detection (presence of ANY name, even "N/A", means
    // the meter was found in the DISCO registry).  customerName strips the "N/A"
    // sentinel and is what callers actually display.
    const rawName =
      raw.customer_name ??
      raw.Customer_Name ??
      raw.CustomerName  ??
      raw.customerName  ??
      raw.customername  ??
      raw.name          ??
      "";
    const customerName = (rawName.trim().toUpperCase() === "N/A" || rawName.trim() === "")
      ? "Customer name unavailable"
      : rawName.trim();

    const s    = (raw.status  ?? "").toUpperCase();
    const code = String(raw.statuscode ?? "");
    const msg  = (raw.message ?? "").toUpperCase();

    const isExplicitFailure =
      s.includes("INVALID_METERNO")   ||
      s.includes("INVALID_METER")     ||
      s.includes("INVALID_METERTYPE") ||
      s === "FAILED"                  ||
      s === "ERROR"                   ||
      msg.includes("INVALID METER")   ||
      msg.includes("INVALID_METERNO");

    const isSuccess =
      !isExplicitFailure && (
        s === "SUCCESS"         ||
        s === "ORDER_COMPLETED" ||
        code === "200"          ||
        !!rawName.trim()
      );

    logger.info("clubkonnect_meter_verify_response", {
      status:        raw.status,
      statuscode:    raw.statuscode,
      raw_fields: {
        customer_name: raw.customer_name ?? "[absent]",
        Customer_Name: raw.Customer_Name ?? "[absent]",
        CustomerName:  raw.CustomerName  ?? "[absent]",
        customerName:  raw.customerName  ?? "[absent]",
        customername:  raw.customername  ?? "[absent]",
        name:          raw.name          ?? "[absent]",
      },
      resolved_name:       customerName,
      is_explicit_failure: isExplicitFailure,
      is_success:          isSuccess,
      message:             raw.message,
    });

    if (!isSuccess) {
      return {
        success:       false,
        customer_name: "",
        meter_number:  input.meter_number,
        message:       raw.message ?? "Meter verification failed",
        raw_response:  raw,
      };
    }

    return {
      success:       true,
      customer_name: customerName,
      address:       raw.address,
      meter_number:  raw.meter_number ?? input.meter_number,
      message:       raw.message ?? "Meter verified successfully",
      raw_response:  raw,
    };
  }

  private async purchaseElectricity(
    input: ProviderPurchaseInput,
    auth: { userId: string; apiKey: string; baseUrl: string },
  ): Promise<ProviderPurchaseResult> {
    const discoId = input.provider_variation_code ?? null;
    if (!discoId) {
      throw new Error(
        "Clubkonnect electricity: DISCO ID (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the Clubkonnect numeric DISCO ID " +
        "(01=EKEDC, 02=IKEDC, 03=AEDC, 04=KEDC, 05=PHEDC, 06=JEDC, " +
        "07=IBEDC, 08=KAEDC, 09=EEDC, 10=BEDC, 11=YEDC, 12=ABA/APLE).",
      );
    }

    const meterType = toMeterTypeCode(input.plan_category);

    this.logRequestCredentialCheck("electricity", "/APIElectricityV1.asp", auth.userId, auth.apiKey);

    const url = this.buildUrl(auth.baseUrl, "/APIElectricityV1.asp", {
      UserID:          auth.userId,
      APIKey:          auth.apiKey,
      ElectricCompany: discoId,
      MeterType:       meterType,
      MeterNo:         input.meter_number,
      Amount:          Math.round(input.amount),
      PhoneNo:         input.phone,
      RequestID:       toRequestId(input.reference),
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect electricity: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKElectricityResponse>(response, "electricity purchase");
    this.warnIfAuthError(raw, "electricity", "/APIElectricityV1.asp");
    const normalized = normalizeStatus(raw.status, raw.statuscode, raw.remark, raw.orderstatus);

    logger.info("clubkonnect_electricity_response", {
      status:     raw.status,
      statuscode: raw.statuscode,
      order_id:   extractOrderId(raw),
      token:      raw.token ? "[present]" : "[absent]",
      message:    raw.message,
      reference:  input.reference,
      normalized,
    });

    return {
      success:            normalized === "successful",
      provider_reference: extractOrderId(raw) ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (normalized === "successful" ? "Electricity purchase successful" : "Electricity purchase failed"),
      status:             normalized,
      raw_response: {
        status:         raw.status,
        statuscode:     raw.statuscode,
        order_id:       extractOrderId(raw),
        message:        raw.message,
        token:          raw.token,
        units:          raw.units,
        customer_name:  raw.customer_name,
        address:        raw.address,
      },
    };
  }

  // ── Cable TV ──────────────────────────────────────────────────────────────

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    const { userId, apiKey, baseUrl } = await this.resolveClubkonnectAuth();

    if (!input.biller_code) {
      throw new Error(
        "Clubkonnect cable: biller_code is missing. " +
        "Ensure the plan has a network_operator set (e.g. dstv, gotv, startimes).",
      );
    }

    // CableTV param: lowercase per Clubkonnect requirement (dstv, gotv, startimes)
    const cableTV      = (input.biller_code || "").trim().toLowerCase();
    const smartCardNumber = input.smartcard_number;

    this.logRequestCredentialCheck("cable_verify", "/APIVerifyCableTVV1.asp", userId, apiKey);
    logger.info("clubkonnect_cable_verify_request", {
      cabletv:   cableTV,
      smartcard: smartCardNumber,
    });

    const url = this.buildUrl(baseUrl, "/APIVerifyCableTVV1.asp", {
      UserID:      userId,
      APIKey:      apiKey,
      CableTV:     cableTV,
      SmartCardNo: smartCardNumber,
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect cable verify: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKCableVerifyResponse>(response, "cable verify");
    this.warnIfAuthError(raw, "cable_verify", "/APIVerifyCableTVV1.asp");

    const s    = (raw.status ?? "").toUpperCase();
    const code = String(raw.statuscode ?? "");
    const isSuccess =
      s === "SUCCESS" ||
      s === "ORDER_COMPLETED" ||
      code === "200" ||
      !!raw.customer_name;

    logger.info("clubkonnect_cable_verify_response", {
      status:        raw.status,
      statuscode:    raw.statuscode,
      customer_name: raw.customer_name ? "[present]" : "[absent]",
      message:       raw.message,
    });

    if (!isSuccess) {
      return {
        success:  false,
        message:  raw.message ?? "Decoder verification failed",
        raw_response: raw,
      };
    }

    const currentPackage = raw.current_package ?? raw.package ?? raw.bouquet ?? undefined;

    return {
      success:          true,
      customer_name:    raw.customer_name,
      current_package:  currentPackage,
      due_date:         raw.due_date,
      smartcard_number: raw.smartcard_number ?? input.smartcard_number,
      message:          raw.message ?? "Decoder verified successfully",
      raw_response:     raw,
    };
  }

  private async purchaseCable(
    input: ProviderPurchaseInput,
    auth: { userId: string; apiKey: string; baseUrl: string },
  ): Promise<ProviderPurchaseResult> {
    const billerCode = input.network_operator ?? null;
    if (!billerCode) {
      throw new Error(
        "Clubkonnect cable: biller code (network_operator) is missing. " +
        "Ensure the plan's network_operator is set (e.g. dstv, gotv, startimes).",
      );
    }

    const planId = input.provider_variation_code ?? input.variation_code ?? null;
    if (!planId) {
      throw new Error(
        "Clubkonnect cable: Package ID is missing for this plan. " +
        "Go to Admin → Service Plans, find this plan, and set " +
        "'Provider Variation Code' to the Clubkonnect package ID.",
      );
    }

    // CableTV param: lowercase per Clubkonnect requirement (dstv, gotv, startimes)
    const cableTV         = (billerCode || "").trim().toLowerCase();
    const smartCardNumber = input.smartcard_number;
    const requestId       = toRequestId(input.reference);

    this.logRequestCredentialCheck("cable_tv", "/APICableTVV1.asp", auth.userId, auth.apiKey);
    logger.info("clubkonnect_cable_request", {
      cabletv:   cableTV,
      package:   planId,
      smartcard: smartCardNumber,
      requestId,
    });

    const url = this.buildUrl(auth.baseUrl, "/APICableTVV1.asp", {
      UserID:      auth.userId,
      APIKey:      auth.apiKey,
      CableTV:     cableTV,
      SmartCardNo: smartCardNumber,
      Package:     planId,
      PhoneNo:     input.phone,
      RequestID:   requestId,
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect cable: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKCableResponse>(response, "cable TV purchase");
    this.warnIfAuthError(raw, "cable_tv", "/APICableTVV1.asp");
    const normalized = normalizeStatus(raw.status, raw.statuscode, raw.remark, raw.orderstatus);

    logger.info("clubkonnect_cable_response", {
      status:     raw.status,
      statuscode: raw.statuscode,
      order_id:   extractOrderId(raw),
      message:    raw.message,
      reference:  input.reference,
      normalized,
    });

    const packageName = raw.package ?? raw.bouquet ?? undefined;

    return {
      success:            normalized === "successful",
      provider_reference: extractOrderId(raw) ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (normalized === "successful" ? "Cable TV subscription successful" : "Cable TV subscription failed"),
      status:             normalized,
      raw_response: {
        status:         raw.status,
        statuscode:     raw.statuscode,
        order_id:       extractOrderId(raw),
        message:        raw.message,
        Customer_Name:  raw.customer_name,
        package:        packageName,
        Due_Date:       raw.due_date,
      },
    };
  }

  // ── Exam Pins (WAEC / JAMB) ───────────────────────────────────────────────
  //
  // Routing: if variation_code starts with "waec" → WAEC endpoint;
  //           if it starts with "jamb" → JAMB endpoint.
  // The admin sets variation_code prefix accordingly when creating plans.

  private async purchaseExamPin(
    input: ProviderPurchaseInput,
    auth: { userId: string; apiKey: string; baseUrl: string },
  ): Promise<ProviderPurchaseResult> {
    const prefix = networkPrefix(input.variation_code ?? "");

    if (prefix === "waec") return this.purchaseWaec(input, auth);
    if (prefix === "jamb") return this.purchaseJamb(input, auth);

    throw new Error(
      `Clubkonnect exam_pin: cannot determine exam type from variation_code '${input.variation_code}'. ` +
      `Expected prefix 'waec-' or 'jamb-' (e.g. waec-pin-1, jamb-profile-charge).`,
    );
  }

  private async purchaseWaec(
    input: ProviderPurchaseInput,
    auth: { userId: string; apiKey: string; baseUrl: string },
  ): Promise<ProviderPurchaseResult> {
    // ExamType comes from provider_variation_code set by admin on the plan (e.g. "WAEC")
    const examType = input.provider_variation_code ?? "WAEC";

    this.logRequestCredentialCheck("waec", "/APIWAECV1.asp", auth.userId, auth.apiKey);

    const url = this.buildUrl(auth.baseUrl, "/APIWAECV1.asp", {
      UserID:    auth.userId,
      APIKey:    auth.apiKey,
      ExamType:  examType,
      PhoneNo:   input.phone,
      RequestID: toRequestId(input.reference),
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect WAEC: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKWaecResponse>(response, "WAEC pin purchase");
    this.warnIfAuthError(raw, "waec", "/APIWAECV1.asp");
    const normalized = normalizeStatus(raw.status, raw.statuscode, raw.remark, raw.orderstatus);
    const cardDetails = raw.carddetails ?? raw.pins;

    logger.info("clubkonnect_waec_response", {
      status:     raw.status,
      statuscode: raw.statuscode,
      order_id:   extractOrderId(raw),
      message:    raw.message,
      reference:  input.reference,
      normalized,
    });

    return {
      success:            normalized === "successful",
      provider_reference: extractOrderId(raw) ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (normalized === "successful" ? "WAEC pin purchase successful" : "WAEC pin purchase failed"),
      status:             normalized,
      raw_response: {
        status:      raw.status,
        statuscode:  raw.statuscode,
        order_id:    extractOrderId(raw),
        message:     raw.message,
        carddetails: cardDetails,
      },
    };
  }

  private async purchaseJamb(
    input: ProviderPurchaseInput,
    auth: { userId: string; apiKey: string; baseUrl: string },
  ): Promise<ProviderPurchaseResult> {
    // ExamType comes from provider_variation_code set by admin on the plan (e.g. "UTME")
    const examType = input.provider_variation_code ?? "UTME";

    this.logRequestCredentialCheck("jamb", "/APIJAMBV1.asp", auth.userId, auth.apiKey);

    const url = this.buildUrl(auth.baseUrl, "/APIJAMBV1.asp", {
      UserID:    auth.userId,
      APIKey:    auth.apiKey,
      ExamType:  examType,
      PhoneNo:   input.phone,
      RequestID: toRequestId(input.reference),
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect JAMB: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKJambResponse>(response, "JAMB pin purchase");
    this.warnIfAuthError(raw, "jamb", "/APIJAMBV1.asp");
    const normalized = normalizeStatus(raw.status, raw.statuscode, raw.remark, raw.orderstatus);
    const cardDetails = raw.carddetails;

    logger.info("clubkonnect_jamb_response", {
      status:     raw.status,
      statuscode: raw.statuscode,
      order_id:   extractOrderId(raw),
      message:    raw.message,
      reference:  input.reference,
      normalized,
    });

    return {
      success:            normalized === "successful",
      provider_reference: extractOrderId(raw) ?? input.reference,
      provider:           this.name,
      message:            raw.message ?? (normalized === "successful" ? "JAMB purchase successful" : "JAMB purchase failed"),
      status:             normalized,
      raw_response: {
        status:      raw.status,
        statuscode:  raw.statuscode,
        order_id:    extractOrderId(raw),
        message:     raw.message,
        pin:         raw.pin,
        carddetails: cardDetails,
      },
    };
  }

  // ── Balance ───────────────────────────────────────────────────────────────
  //
  // Endpoint: GET /APIWalletBalanceV1.asp?UserID=...&APIKey=...
  // Clubkonnect balance field name varies by account tier — all known variants
  // are tried in priority order via resolveBalanceField().

  /** Tries every known Clubkonnect balance field name; returns the first non-undefined value. */
  private resolveBalanceField(raw: CKBalanceResponse): string | number | undefined {
    return (
      raw.balance          ??
      raw.walletbalance    ??
      raw.wallet_balance   ??
      raw.WalletBalance    ??
      raw.AvailableBalance ??
      raw.available_balance ??
      raw.amount           ??
      undefined
    );
  }

  async getBalance(): Promise<ProviderBalance> {
    const { userId, apiKey, baseUrl } = await this.resolveClubkonnectAuth();

    this.logRequestCredentialCheck("balance", "/APIWalletBalanceV1.asp", userId, apiKey);

    const url = this.buildUrl(baseUrl, "/APIWalletBalanceV1.asp", {
      UserID: userId,
      APIKey: apiKey,
    });

    const response = await this.fetchGet(url);

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Clubkonnect balance: HTTP ${response.status} — verify UserID and APIKey`);
    }

    const raw = await this.parseJson<CKBalanceResponse>(response, "balance");

    // Log full raw response for debugging (APIKey is not present in the response body)
    logger.info("clubkonnect_balance_raw_response", {
      endpoint: "/APIWalletBalanceV1.asp",
      baseUrl,
      raw,
    });

    // Detect auth failure before attempting balance parse — never silently return 0
    this.warnIfAuthError(raw, "balance", "/APIWalletBalanceV1.asp");
    if (this.isAuthErrorStatus(raw.status)) {
      throw new Error(
        `Clubkonnect balance: authentication failed (${raw.status}) — ` +
        `verify UserID and APIKey in Admin > API Integrations > Clubkonnect`,
      );
    }

    // Resolve balance from whichever field name Clubkonnect sent
    const rawBalance = this.resolveBalanceField(raw);

    if (rawBalance === undefined) {
      const responseKeys = Object.keys(raw);
      throw new Error(
        `Unable to parse Clubkonnect balance — no recognized balance field in response. ` +
        `Response keys: [${responseKeys.join(", ")}]`,
      );
    }

    // Clubkonnect may return comma-formatted strings e.g. "1,992.31"
    const balanceStr = String(rawBalance).replace(/,/g, "");
    const balance    = parseFloat(balanceStr);

    if (isNaN(balance)) {
      throw new Error(
        `Clubkonnect balance: cannot parse balance value "${rawBalance}" — ` +
        `raw: ${JSON.stringify(raw).slice(0, 200)}`,
      );
    }

    logger.info("clubkonnect_balance_parsed", {
      endpoint:       "/APIWalletBalanceV1.asp",
      balance_raw:    rawBalance,
      balance_parsed: balance,
    });

    return {
      available:    balance,
      currency:     "NGN",
      raw_response: raw,
    };
  }

  // ── Transaction verify ────────────────────────────────────────────────────
  //
  // Queries Clubkonnect using the original RequestID (= our internal reference).

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const { userId, apiKey, baseUrl } = await this.resolveClubkonnectAuth();

    this.logRequestCredentialCheck("verify_transaction", "/APIQueryV1.asp", userId, apiKey);

    const url = this.buildUrl(baseUrl, "/APIQueryV1.asp", {
      UserID:    userId,
      APIKey:    apiKey,
      RequestID: reference,
    });

    let response: Response;
    try {
      response = await this.fetchGet(url);
    } catch (err) {
      return {
        found:   false,
        status:  "pending",
        message: `Clubkonnect query failed: ${(err as Error).message}`,
      };
    }

    const raw = await this.parseJson<CKQueryResponse>(response, "query transaction");

    // Detect authentication failure — throw so callers see an "error" not a false "failed"
    // classification that would cause reconciliation to silently skip the transaction.
    const rawStatus = (raw.status ?? "").toUpperCase();
    if (rawStatus.startsWith("AUTHENTICATION_FAILED") || rawStatus === "INVALID_KEY") {
      throw new Error(
        `Clubkonnect query authentication failed (${raw.status}) — verify UserID and APIKey in Admin > API Integrations > Clubkonnect`,
      );
    }

    const effectiveMessage = raw.orderremark ?? raw.remark ?? raw.message;
    // Use orderremark (query responses) with remark as fallback so "TRANSACTION SUCCESSFUL"
    // embedded in orderremark is seen by normalizeStatus.
    const normalized = normalizeStatus(raw.status, raw.statuscode, raw.orderremark ?? raw.remark, raw.orderstatus);

    // When Clubkonnect returns TXN_HISTORY with a token present, the electricity
    // purchase completed successfully — promote "processing" to "successful".
    const isTxnHistory = rawStatus === "TXN_HISTORY";
    const hasToken     = !!(raw.token?.trim());
    const finalStatus  = (isTxnHistory && hasToken && normalized !== "successful")
      ? "successful"
      : normalized;

    logger.info("clubkonnect_query_response", {
      status:        raw.status,
      statuscode:    raw.statuscode,
      orderstatus:   raw.orderstatus,
      orderremark:   raw.orderremark,
      remark:        raw.remark,
      token:         raw.token ? "[PRESENT]" : undefined,
      units:         raw.units,
      customer_name: raw.customer_name ? "[PRESENT]" : undefined,
      meter_number:  raw.meter_number,
      order_id:      extractOrderId(raw),
      message:       effectiveMessage,
      reference,
      normalized,
      finalStatus,
    });

    return {
      found:              finalStatus !== "failed" || !!extractOrderId(raw),
      status:             toVerifyStatus(finalStatus),
      provider_reference: extractOrderId(raw),
      message:            effectiveMessage ?? `Transaction status: ${finalStatus}`,
      raw_response:       raw,
    };
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<ProviderHealthResult> {
    try {
      const creds = await getProviderCredentials(this.name);

      if (!creds) {
        return {
          healthy: false,
          message: "Clubkonnect credentials not configured — add UserID and APIKey in Admin > API Integrations",
        };
      }
      if (!creds.username_encrypted) {
        return {
          healthy: false,
          message: "Clubkonnect UserID not set — add in Admin > API Integrations > Clubkonnect (username field)",
        };
      }
      if (!creds.api_key_encrypted) {
        return {
          healthy: false,
          message: "Clubkonnect APIKey not set — add in Admin > API Integrations > Clubkonnect (api_key field)",
        };
      }

      // Live balance check — Clubkonnect has a balance endpoint
      const start   = Date.now();
      const balance = await this.getBalance();
      const latency = Date.now() - start;
      return {
        healthy:    true,
        latency_ms: latency,
        message:    `Clubkonnect balance: ₦${balance.available.toLocaleString("en-NG", { minimumFractionDigits: 2 })} — credentials valid`,
      };
    } catch (err) {
      return {
        healthy: false,
        message: `Clubkonnect health check failed: ${(err as Error).message}`,
      };
    }
  }
}
