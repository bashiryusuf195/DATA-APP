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

const MASKAWASUB_TIMEOUT_MS = 30_000;

// ── Operator / ID mapping ─────────────────────────────────────────────────────
//
// Confirmed from the Maskawasub dashboard's Reference Data > Networks tab.
// Cable (GOtv=1, DStv=2, StarTimes=3) and Electricity DisCo IDs (Ikeja=1,
// Eko=2, Abuja=3, Kano=4, Enugu=5, Port Harcourt=6, Ibadan=7, Kaduna=8,
// Jos=9, Benin=10, Yola=11) do NOT need a map here — those are entered
// directly as each plan's Provider Variation Code in Admin → Service Plans.

const AIRTIME_DATA_NETWORK_ID_MAP: Record<string, number | null> = {
  mtn:       1,
  glo:       2,
  "9mobile": 3,
  airtel:    4,
  etisalat:  3, // maps to 9mobile
};

// eData-style prefix extraction from variation_code, e.g. "mtn-1gb-7d" -> "mtn"
function extractPrefix(variationCode: string): string {
  return variationCode.split("-")[0].toLowerCase();
}

function resolveNetworkId(variationCode: string): number | null {
  const key = extractPrefix(variationCode) === "etisalat" ? "9mobile" : extractPrefix(variationCode);
  return AIRTIME_DATA_NETWORK_ID_MAP[key] ?? null;
}

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 5) return "***";
  return `${phone.slice(0, 5)}${"*".repeat(phone.length - 5)}`;
}

// meter_type: eData/your admin UI use "prepaid" | "postpaid" strings.
// Maskawasub wants a NUMBER: 1 = PREPAID, 2 = POSTPAID.
function resolveMeterTypeId(meterType?: string | null): number {
  return (meterType ?? "prepaid").toLowerCase() === "postpaid" ? 2 : 1;
}

// ── Maskawasub response shapes ────────────────────────────────────────────────
// NOTE: inferred from the vendor's PDF docs, not a live response sample —
// double-check field names (esp. status vs Status) against a real response
// the first time you run this against their sandbox/live environment.

interface MaskawasubTxnResponse {
  status?:         string;
  Status?:         string;
  message?:        string;
  balance_before?: string;
  balance_after?:  string;
  [key: string]:   unknown;
}

interface MaskawasubValidateMeterResponse {
  status?:  string;
  success?: boolean;
  message?: string;
  data?: {
    customer_name?:    string;
    customer_address?: string;
  };
}

interface MaskawasubValidateIucResponse {
  status?:  string;
  success?: boolean;
  message?: string;
  data?: {
    customer_name?:   string;
    smart_card_number?: string;
  };
}

interface MaskawasubUserResponse {
  balance?: string | number;
  [key: string]: unknown;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class MaskawasubProvider extends HttpVTUProvider {
  readonly name = "maskawasub";

  constructor() {
    super("maskawasub");
  }

  // ── HTTP primitives (mirrors edata.provider.ts) ───────────────────────────

  private async fetchWithTimeout(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    timeoutMs = MASKAWASUB_TIMEOUT_MS
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
        throw new Error(`Maskawasub request timed out after ${timeoutMs}ms [${url}]`);
      }
      throw new Error(`Maskawasub network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`Maskawasub: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Maskawasub: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(0, 200)}`
      );
    }
  }

  private authHeaders(apiKey: string): Record<string, string> {
    return {
      "Authorization": `Token ${apiKey}`,
      "Content-Type":  "application/json",
    };
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("Maskawasub: api_key not set — add it in Admin > API Integrations > Maskawasub");
    if (!baseUrl) throw new Error("Maskawasub: base_url not set — add it in Admin > API Integrations > Maskawasub");

    if (input.service_type === "airtime")     return this.purchaseAirtime(input, apiKey, baseUrl);
    if (input.service_type === "data")        return this.purchaseData(input, apiKey, baseUrl);
    if (input.service_type === "electricity") return this.purchaseElectricity(input, apiKey, baseUrl);
    if (input.service_type === "cable_tv")    return this.purchaseCable(input, apiKey, baseUrl);

    throw new Error(
      `Maskawasub: service_type '${input.service_type}' not implemented. ` +
      `Supported: airtime, data, electricity, cable_tv.`
    );
  }

  // ── Airtime ───────────────────────────────────────────────────────────────

  private async purchaseAirtime(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const variationCode = input.variation_code ?? "";
    const networkId = resolveNetworkId(variationCode);

    if (networkId === null) {
      throw new Error(
        `Maskawasub airtime: no network_id configured for variation_code '${variationCode}'. ` +
        `Fill in AIRTIME_DATA_NETWORK_ID_MAP in maskawasub.provider.ts with the real IDs from Maskawasub.`
      );
    }

    const payload = {
      network:        networkId,
      amount:         input.amount,
      mobile_number:  input.phone ?? "",
      Ported_number:  true,
      airtime_type:   "VTU",
    };

    console.log("[MASKAWASUB] airtime purchase →", {
      network: networkId, amount: input.amount, phone: maskPhone(input.phone), reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/topup/`, {
      method:  "POST",
      headers: this.authHeaders(apiKey),
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Maskawasub airtime: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<MaskawasubTxnResponse>(response, "airtime topup");
    const isSuccess = this.isSuccessStatus(raw);

    console.log("[MASKAWASUB] airtime purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message, reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Airtime purchase successful" : "Airtime purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response: {
        status: raw.status, Status: raw.Status, message: raw.message,
        balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  private async purchaseData(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const rawPlanId = input.provider_variation_code ?? null;
    if (!rawPlanId) {
      throw new Error(
        "Maskawasub data: Provider plan ID is missing for this plan. " +
        "Go to Admin → Service Plans, find this data plan, and set " +
        "'Provider Variation Code' to the numeric Plan ID from the Maskawasub plan list " +
        "(e.g. 235 for MTN SME 1GB 7-days)."
      );
    }
    const planId = parseInt(rawPlanId, 10);
    if (isNaN(planId) || planId <= 0) {
      throw new Error(
        `Maskawasub data: Provider plan ID '${rawPlanId}' is not a valid positive integer. ` +
        "Update the plan in Admin → Service Plans with the correct numeric Maskawasub plan ID."
      );
    }

    const variationCode = input.variation_code ?? "";
    const networkId = resolveNetworkId(variationCode);
    if (networkId === null) {
      throw new Error(
        `Maskawasub data: no network_id configured for variation_code '${variationCode}'. ` +
        `Fill in AIRTIME_DATA_NETWORK_ID_MAP in maskawasub.provider.ts with the real IDs from Maskawasub.`
      );
    }

    const payload = {
      network:        networkId,
      mobile_number:  input.phone ?? "",
      plan:           planId,
      Ported_number:  true,
    };

    console.log("[MASKAWASUB] data purchase →", {
      network: networkId, plan: planId, amount: input.amount, phone: maskPhone(input.phone), reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/data/`, {
      method:  "POST",
      headers: this.authHeaders(apiKey),
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Maskawasub data: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<MaskawasubTxnResponse>(response, "data purchase");
    const isSuccess = this.isSuccessStatus(raw);

    console.log("[MASKAWASUB] data purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message, reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Data purchase successful" : "Data purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response: {
        status: raw.status, Status: raw.Status, message: raw.message,
        balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Electricity ───────────────────────────────────────────────────────────

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("Maskawasub: api_key not set — add it in Admin > API Integrations > Maskawasub");
    if (!baseUrl) throw new Error("Maskawasub: base_url not set — add it in Admin > API Integrations > Maskawasub");

    if (!input.disco_name) {
      throw new Error(
        "Maskawasub electricity: disco_name (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the Maskawasub disco ID (see TODO in this file)."
      );
    }

    const params = new URLSearchParams({
      meternumber: input.meter_number,
      disconame:   input.disco_name,
      mtype:       String(resolveMeterTypeId(input.meter_type)),
    });

    console.log("[MASKAWASUB] meter verify →", {
      disco: input.disco_name, meter_type: input.meter_type, meter: maskPhone(input.meter_number),
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/validatemeter?${params.toString()}`, {
      method:  "GET",
      headers: this.authHeaders(apiKey),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Maskawasub meter verify: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<MaskawasubValidateMeterResponse>(response, "meter verify");
    const isSuccess = raw.success === true || (raw.status ?? "").toLowerCase() === "success";
    const customerName = raw.data?.customer_name ?? "";

    console.log("[MASKAWASUB] meter verify ←", {
      status: raw.status, success: raw.success, customer_name: customerName, message: raw.message,
    });

    if (!isSuccess) {
      return {
        success: false, customer_name: "", meter_number: input.meter_number,
        message: raw.message ?? "Meter verification failed", raw_response: raw,
      };
    }

    return {
      success: true, customer_name: customerName, address: raw.data?.customer_address,
      meter_number: input.meter_number, message: raw.message ?? "Meter verified successfully", raw_response: raw,
    };
  }

  private async purchaseElectricity(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const discoName = input.provider_variation_code ?? null;
    if (!discoName) {
      throw new Error(
        "Maskawasub electricity: disco_name (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the Maskawasub disco ID."
      );
    }

    const payload = {
      disco_name:   discoName,
      amount:       input.amount,
      meter_number: input.meter_number ?? "",
      MeterType:    resolveMeterTypeId(input.plan_category),
    };

    console.log("[MASKAWASUB] electricity purchase →", {
      disco: discoName, meter_type: payload.MeterType, amount: input.amount,
      meter: maskPhone(input.meter_number), reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/billpayment/`, {
      method:  "POST",
      headers: this.authHeaders(apiKey),
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Maskawasub electricity: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<MaskawasubTxnResponse>(response, "electricity purchase");
    const isSuccess = this.isSuccessStatus(raw);

    console.log("[MASKAWASUB] electricity purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message, reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Electricity purchase successful" : "Electricity purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response: {
        status: raw.status, Status: raw.Status, message: raw.message,
        balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Cable TV ──────────────────────────────────────────────────────────────

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("Maskawasub: api_key not set — add it in Admin > API Integrations > Maskawasub");
    if (!baseUrl) throw new Error("Maskawasub: base_url not set — add it in Admin > API Integrations > Maskawasub");

    if (!input.biller_code) {
      throw new Error(
        "Maskawasub cable: biller_code is missing. " +
        "Ensure the plan has a network_operator/cablename ID set."
      );
    }

    const params = new URLSearchParams({
      smart_card_number: input.smartcard_number,
      cablename:          input.biller_code,
    });

    console.log("[MASKAWASUB] cable (IUC) verify →", {
      biller: input.biller_code, smartcard: maskPhone(input.smartcard_number),
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/validateiuc?${params.toString()}`, {
      method:  "GET",
      headers: this.authHeaders(apiKey),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Maskawasub cable verify: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<MaskawasubValidateIucResponse>(response, "IUC verify");
    const isSuccess = raw.success === true || (raw.status ?? "").toLowerCase() === "success";

    console.log("[MASKAWASUB] cable verify ←", {
      success: raw.success, customer_name: raw.data?.customer_name, message: raw.message,
    });

    if (!isSuccess) {
      return { success: false, message: raw.message ?? "Decoder verification failed", raw_response: raw };
    }

    return {
      success:          true,
      customer_name:    raw.data?.customer_name ?? undefined,
      smartcard_number: raw.data?.smart_card_number ?? input.smartcard_number,
      message:          raw.message ?? "Decoder verified successfully",
      raw_response:     raw,
    };
  }

  private async purchaseCable(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const cablename  = input.provider_variation_code ?? null;
    const cableplan  = input.variation_code ?? null;

    if (!cablename || !cableplan) {
      throw new Error(
        "Maskawasub cable: cablename/cableplan IDs are missing. " +
        "Go to Admin → Service Plans, find this plan, and set both " +
        "'Provider Variation Code' (cablename ID) and 'Variation Code' (cableplan ID) " +
        "to the correct Maskawasub IDs."
      );
    }

    const payload = {
      cablename,
      cableplan,
      smart_card_number: input.smartcard_number ?? "",
    };

    console.log("[MASKAWASUB] cable purchase →", {
      cablename, cableplan, smartcard: maskPhone(input.smartcard_number), reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/cablesub/`, {
      method:  "POST",
      headers: this.authHeaders(apiKey),
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Maskawasub cable: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<MaskawasubTxnResponse>(response, "cable purchase");
    const isSuccess = this.isSuccessStatus(raw);

    console.log("[MASKAWASUB] cable purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message, reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Cable TV subscription successful" : "Cable TV subscription failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response: {
        status: raw.status, Status: raw.Status, message: raw.message,
        balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  private isSuccessStatus(raw: MaskawasubTxnResponse): boolean {
    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    return SUCCESS_VALUES.has(rawStatusLower);
  }

  // ── Plan listing ─────────────────────────────────────────────────────────
  //
  // Unlike eData, Maskawasub does not have a plan-list endpoint documented
  // either — plans come from the static reference table on their dashboard
  // (Data Plans / Networks / Cable TV / Electricity tabs). If you want this
  // wired the same way eData's DATA_PLAN_LIST is, export the full table from
  // your dashboard and I'll turn it into the same static list format.
  async fetchPlans(): Promise<Array<Record<string, unknown>>> {
    throw new Error(
      "Maskawasub: fetchPlans() not implemented — export the plan reference table " +
      "from your Maskawasub dashboard and hardcode it here, same pattern as eData."
    );
  }

  // Maskawasub's docs show GET /api/data/{id}, /api/billpayment/{id},
  // /api/cablesub/{id} for querying by their internal transaction ID — not by
  // your own reference string, so a generic verifyTransaction(reference) isn't
  // directly supported without first mapping reference -> their transaction id
  // (e.g. stored from the purchase response). Left unimplemented for now.
  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    console.warn("[MASKAWASUB] verifyTransaction called but no reference-based query endpoint is documented", { reference });
    return {
      found:   false,
      status:  "pending",
      message: "Maskawasub requires querying by their internal transaction ID, not your reference — check Maskawasub dashboard",
    };
  }

  async getBalance(): Promise<ProviderBalance> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("Maskawasub: api_key not set — add it in Admin > API Integrations > Maskawasub");
    if (!baseUrl) throw new Error("Maskawasub: base_url not set — add it in Admin > API Integrations > Maskawasub");

    const response = await this.fetchWithTimeout(`${baseUrl}/api/user/`, {
      method:  "GET",
      headers: this.authHeaders(apiKey),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Maskawasub balance: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<MaskawasubUserResponse>(response, "user details");
    const available = raw.balance !== undefined ? Number(raw.balance) : NaN;

    if (isNaN(available)) {
      throw new Error(
        "Maskawasub: could not find a 'balance' field on /api/user/ response — " +
        "check the actual field name in a live response and update getBalance()."
      );
    }

    return { available, currency: "NGN", raw_response: raw };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const creds = await getProviderCredentials(this.name);

    if (!creds) {
      return { healthy: false, message: "Maskawasub credentials not configured — add base_url and api_key in Admin > API Integrations" };
    }
    if (!creds.api_key_encrypted) {
      return { healthy: false, message: "Maskawasub api_key not set — add in Admin > API Integrations > Maskawasub" };
    }
    if (!creds.base_url) {
      return { healthy: false, message: "Maskawasub base_url not set — add in Admin > API Integrations > Maskawasub" };
    }

    try {
      await this.getBalance();
      return { healthy: true, message: "Maskawasub credentials valid — /api/user/ reachable" };
    } catch (err) {
      return { healthy: false, message: `Maskawasub health check failed: ${(err as Error).message}` };
    }
  }
}
