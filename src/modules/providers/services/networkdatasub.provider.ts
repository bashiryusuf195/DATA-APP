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
//
// NetworkDataSub docs: https://networkdatasub.com/api-documentation
// Base URL: https://networkdatasub.com/api
// Auth: `Authorization: Token YOUR_API_TOKEN` header (single token, no
// separate public/secret key split like VTPass).
//
// NOTE: The published docs only expose a cable VERIFY endpoint
// (POST /cable/verify). No cable PURCHASE endpoint is documented, unlike
// VTPass/eData. purchase() throws a clear error for cable_tv until/unless
// NetworkDataSub documents one — do not guess an endpoint shape here.

const NDS_TIMEOUT_MS = 30_000;

// Airtime / data network IDs — CONFIRMED live against GET /data/all-plans
// response on 2026-09-14 (network.id 2 = Airtel, 3 = Glo, 4 = 9mobile;
// MTN=1 inferred by elimination, not yet seen directly in a sample — verify
// if an MTN purchase behaves unexpectedly). Different numbering scheme than
// eData's DATA_NETWORK_ID_MAP; keep separate, never assume alignment.
const AIRTIME_NETWORK_ID_MAP: Record<string, number> = {
  mtn: 1,
  airtel: 2,
  glo: 3,
  "9mobile": 4,
  etisalat: 4,
};

// Reference only (confirmed live 2026-09-14) — actual disco_id / provider_id
// values to use as provider_variation_code / network_operator when setting
// up Service Plans. Call fetchElectricityProviders()/fetchCableProviders()
// if these ever need re-confirming.
//
// Electricity discos (GET /electricity/providers):
//   1 = Ikeja Electric     5 = Enugu Electric      9  = Jos Electric
//   2 = Eko Electric       6 = Port Harcourt Elec. 10 = Benin Electric
//   3 = Abuja Electric     7 = Ibadan Electric     11 = Yola Electric
//   4 = Kano Electric      8 = Kaduna Electric
//
// Cable providers (GET /cable/providers):
//   1 = GOTV   2 = DSTV   3 = STARTIME

// Electricity meter_type codes per NetworkDataSub docs: '1' prepaid, '2' postpaid.
const METER_TYPE_CODE_MAP: Record<string, string> = {
  prepaid: "1",
  postpaid: "2",
  "1": "1",
  "2": "2",
};

// ── NetworkDataSub response shapes ────────────────────────────────────────────

interface NdsErrorEnvelope {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

interface NdsAirtimePurchaseResponse extends NdsErrorEnvelope {
  data?: {
    transaction?: {
      id?: number;
      reference?: string;
      amount?: number;
      status?: string;
      created_at?: string;
    };
    new_balance?: number;
    required_amount?: number;
    wallet_balance?: number;
  };
}

interface NdsDataPurchaseResponse extends NdsErrorEnvelope {
  data?: {
    transaction_id?: number;
    reference?: string;
    amount?: number;
    status?: string;
    new_balance?: number;
    phone_number?: string;
    network?: string;
    plan_id?: number;
  };
}

interface NdsElectricityVerifyResponse extends NdsErrorEnvelope {
  data?: {
    customer_name?: string;
    customer_address?: string;
    address?: string;
    meter_number?: string;
    tariff_class?: string;
  };
}

interface NdsElectricityPurchaseResponse extends NdsErrorEnvelope {
  data?: {
    transaction_id?: number;
    reference?: string;
    token?: string;
    units?: string | number;
    amount?: number;
    status?: string;
    new_balance?: number;
  };
}

interface NdsCableVerifyResponse extends NdsErrorEnvelope {
  data?: {
    customer_name?: string;
    smart_card_number?: string;
    current_bouquet?: string;
    due_date?: string;
  };
}

interface NdsIdentityResponse extends NdsErrorEnvelope {
  data?: {
    verification_id?: number;
    transaction_id?: string;
    reference?: string;
    amount?: number;
    provider?: string;
    details?: {
      nin?: string;
      bvn?: string;
      firstName?: string;
      middleName?: string | null;
      surname?: string;
      lastName?: string;
      gender?: string;
      birthDate?: string;
      birthday?: string;
      photo?: string;
      telephoneNo?: string;
      phoneNumber?: string;
      nameOnCard?: string;
    };
    pdf_base64?: string;
    has_pdf?: boolean;
    wallet_balance?: number;
  };
}

// Confirmed live (2026-09-14) shape for both GET /electricity/providers and
// GET /cable/providers — same wrapper, same provider object shape (only the
// id-alias field differs: disco_id vs provider_id, both equal to `id`).
interface NdsProvider {
  id: number;
  name: string;
  disco_id?: number;
  provider_id?: number;
  code?: string | null;
  logo?: string;
  is_active?: boolean;
}

interface NdsProviderListResponse extends NdsErrorEnvelope {
  data?: {
    providers?: NdsProvider[];
    total?: number;
  };
}

// Confirmed live (2026-09-14) shape for GET /data/all-plans. Note the three
// distinct ID fields (id / plan_id / api_info.api_plan_id) — see the
// dataPlanId() comment above for why this matters before wiring purchases.
interface NdsDataPlan {
  id: number;
  plan_id: string;
  network?: { id: number; name: string; code: string };
  plan_name?: string;
  data_size?: string;
  price?: { amount: number; formatted?: string; currency?: string };
  validity?: { days: number; formatted?: string };
  type?: { id: number; name: string; code: string };
  status?: { code: string; name: string; is_active: boolean };
  api_info?: {
    api_plan_id?: string;
    provider_name?: string;
    is_api_active?: boolean;
    last_synced_at?: string | null;
  };
  created_at?: string;
  updated_at?: string;
}

interface NdsDataPlansResponse extends NdsErrorEnvelope {
  data?: {
    plans?: NdsDataPlan[];
    pagination?: {
      current_page: number;
      per_page: number;
      total: number;
      total_pages: number;
      has_next_page: boolean;
      has_prev_page: boolean;
    };
    summary?: {
      total_plans: number;
      active_plans: number;
      networks_count: number;
      average_price: number;
    };
  };
  filters_applied?: Record<string, unknown>;
  timestamp?: string;
}

interface NdsWalletResponse extends NdsErrorEnvelope {
  data?: {
    balance?: number | string;
    wallet_balance?: number | string;
  };
}

interface NdsUserResponse extends NdsErrorEnvelope {
  data?: {
    id?: number;
    name?: string;
    email?: string;
    phone?: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskPhone(phone?: string | null): string {
  if (!phone || phone.length < 5) return "***";
  return `${phone.slice(0, 4)}${"*".repeat(phone.length - 4)}`;
}

function extractPrefix(code: string): string {
  return code.split("-")[0].toLowerCase();
}

function resolveAirtimeNetworkId(variationCode: string): number | null {
  const id = AIRTIME_NETWORK_ID_MAP[extractPrefix(variationCode)];
  return id !== undefined ? id : null;
}

function resolveMeterTypeCode(raw: string | null | undefined): string {
  if (!raw) return "1";
  return METER_TYPE_CODE_MAP[raw.toLowerCase()] ?? "1";
}

interface NdsCreds {
  baseUrl: string;
  apiKey: string;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class NetworkDataSubProvider extends HttpVTUProvider {
  readonly name = "networkdatasub";

  constructor() {
    super("networkdatasub");
  }

  // ── Credential loading ──────────────────────────────────────────────────

  private async loadCreds(): Promise<NdsCreds> {
    const creds = await this.requireCredentials();

    const baseUrl = creds.base_url ?? "";
    const apiKey = creds.api_key_encrypted ?? "";

    const missing: string[] = [];
    if (!baseUrl) missing.push("base_url");
    if (!apiKey) missing.push("api_key");

    if (missing.length > 0) {
      throw new Error(
        `NetworkDataSub: credentials not fully configured — missing: ${missing.join(
          ", "
        )}. Add them in Admin > API Integrations > NetworkDataSub. ` +
          `Generate the token at https://networkdatasub.com/api-tokens.`
      );
    }

    return { baseUrl, apiKey };
  }

  private headers(creds: NdsCreds): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${creds.apiKey}`,
    };
  }

  // ── HTTP primitives ───────────────────────────────────────────────────────

  private async fetchWithTimeout(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    timeoutMs = NDS_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(
          `NetworkDataSub request timed out after ${timeoutMs}ms [${url}]`
        );
      }
      throw new Error(`NetworkDataSub network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`NetworkDataSub: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `NetworkDataSub: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(
          0,
          200
        )}`
      );
    }
  }

  private checkAuthFailure(response: Response, context: string): void {
    if (response.status === 401) {
      throw new Error(
        `NetworkDataSub: HTTP 401 on ${context} — missing, malformed, invalid, or expired API token. ` +
          `Verify api_key in Admin > API Integrations > NetworkDataSub.`
      );
    }
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    switch (input.service_type) {
      case "airtime":
        return this.purchaseAirtime(input);
      case "data":
        return this.purchaseData(input);
      case "electricity":
        return this.purchaseElectricity(input);
      case "identity_verification":
        return this.purchaseIdentity(input);
      case "cable_tv":
        // Not documented — NetworkDataSub's public API only exposes
        // POST /cable/verify, no purchase endpoint. Fail loudly instead
        // of guessing a shape that could silently misfire in production.
        throw new Error(
          "NetworkDataSub: cable TV purchase is not available via the External API — " +
            "only smartcard verification (/cable/verify) is documented. " +
            "Check https://networkdatasub.com/api-documentation for updates, or disable " +
            "cable_tv for this provider in Admin > API Integrations."
        );
      default:
        throw new Error(
          `NetworkDataSub: service_type '${input.service_type}' is not supported. ` +
            `Supported: airtime | data | electricity | identity_verification`
        );
    }
  }

  // ── Airtime ───────────────────────────────────────────────────────────────

  private async purchaseAirtime(
    input: ProviderPurchaseInput
  ): Promise<ProviderPurchaseResult> {
    const creds = await this.loadCreds();

    const variationCode = input.network_operator ?? input.variation_code ?? "";
    const network = resolveAirtimeNetworkId(variationCode);

    if (network === null) {
      throw new Error(
        `NetworkDataSub airtime: cannot resolve network for '${variationCode}'. ` +
          `Expected prefix: mtn | airtel | glo | 9mobile`
      );
    }

    const payload: Record<string, unknown> = {
      network,
      phone: input.phone,
      amount: input.amount,
    };

    // airtime_type defaults to "vtu" server-side; only send if explicitly set.
    if (input.provider_variation_code) {
      payload.airtime_type = input.provider_variation_code;
    }

    console.log("[NDS] airtime purchase →", {
      network,
      amount: input.amount,
      phone: maskPhone(input.phone),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${creds.baseUrl}/airtime/purchase`, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify(payload),
    });

    this.checkAuthFailure(response, "/airtime/purchase");

    const raw = await this.parseJson<NdsAirtimePurchaseResponse>(response, "airtime purchase");

    console.log("[NDS] airtime purchase ←", {
      success: raw.success,
      status: raw.data?.transaction?.status,
      reference: input.reference,
    });

    const isSuccess = raw.success === true;

    return {
      success: isSuccess,
      provider_reference: raw.data?.transaction?.reference ?? input.reference,
      provider: this.name,
      message: raw.message ?? (isSuccess ? "Airtime purchased successfully" : "Airtime purchase failed"),
      status: isSuccess ? "successful" : "failed",
      raw_response: raw,
    };
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  //
  // NetworkDataSub resolves the network internally from data_plan_id — only
  // the plan ID and phone number are needed on our side. The plan ID must be
  // stored as provider_variation_code (or variation_code) on the local plan
  // record, same convention as eData's numeric plan IDs.

  private async purchaseData(
    input: ProviderPurchaseInput
  ): Promise<ProviderPurchaseResult> {
    const creds = await this.loadCreds();

    const rawPlanId = input.provider_variation_code ?? input.variation_code;
    if (!rawPlanId) {
      throw new Error(
        "NetworkDataSub data: data_plan_id is missing for this plan. " +
          "Go to Admin → Service Plans, find this data plan, and set " +
          "'Provider Variation Code' to the NetworkDataSub numeric plan ID."
      );
    }

    const planId = parseInt(rawPlanId, 10);
    if (isNaN(planId) || planId <= 0) {
      throw new Error(
        `NetworkDataSub data: plan ID '${rawPlanId}' is not a valid positive integer.`
      );
    }

    const payload = {
      data_plan_id: planId,
      phone_number: input.phone,
    };

    console.log("[NDS] data purchase →", {
      data_plan_id: planId,
      phone: maskPhone(input.phone),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${creds.baseUrl}/data/purchase`, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify(payload),
    });

    this.checkAuthFailure(response, "/data/purchase");

    const raw = await this.parseJson<NdsDataPurchaseResponse>(response, "data purchase");

    console.log("[NDS] data purchase ←", {
      success: raw.success,
      status: raw.data?.status,
      reference: input.reference,
    });

    const isSuccess = raw.success === true;

    return {
      success: isSuccess,
      provider_reference: raw.data?.reference ?? input.reference,
      provider: this.name,
      message: raw.message ?? (isSuccess ? "Data purchased successfully" : "Data purchase failed"),
      status: isSuccess ? "successful" : "failed",
      raw_response: raw,
    };
  }

  // ── Electricity ───────────────────────────────────────────────────────────
  //
  // disco_id (integer) must be stored as provider_variation_code on the plan
  // record — sourced from GET /electricity/providers, there is no fixed
  // string-code list like VTPass/eData use.

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    const creds = await this.loadCreds();

    if (!input.disco_name) {
      throw new Error(
        "NetworkDataSub electricity: disco_id is missing. " +
          "Set the plan's network_operator/provider_variation_code to the numeric disco_id from " +
          "GET /electricity/providers."
      );
    }

    const discoId = parseInt(input.disco_name, 10);
    if (isNaN(discoId) || discoId <= 0) {
      throw new Error(
        `NetworkDataSub electricity: disco_id '${input.disco_name}' is not a valid positive integer. ` +
          "Set the plan's network_operator/provider_variation_code to the numeric disco_id from " +
          "GET /electricity/providers."
      );
    }

    const meterType = resolveMeterTypeCode(input.meter_type);

    console.log("[NDS] meter verify →", {
      disco_id: discoId,
      meter_type: meterType,
      meter: maskPhone(input.meter_number),
    });

    const response = await this.fetchWithTimeout(`${creds.baseUrl}/electricity/verify`, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify({
        disco_id: discoId,
        meter_number: input.meter_number,
        meter_type: meterType,
      }),
    });

    this.checkAuthFailure(response, "/electricity/verify");

    const raw = await this.parseJson<NdsElectricityVerifyResponse>(response, "meter verify");

    console.log("[NDS] meter verify ←", {
      success: raw.success,
      customer_name: raw.data?.customer_name,
      message: raw.message,
    });

    if (raw.success !== true) {
      return {
        success: false,
        customer_name: "",
        meter_number: input.meter_number,
        message: raw.message ?? "Meter verification failed",
        raw_response: raw,
      };
    }

    return {
      success: true,
      customer_name: raw.data?.customer_name ?? "",
      address: raw.data?.customer_address ?? raw.data?.address,
      meter_number: raw.data?.meter_number ?? input.meter_number,
      message: raw.message ?? "Meter verified successfully",
      raw_response: raw,
    };
  }

  private async purchaseElectricity(
    input: ProviderPurchaseInput
  ): Promise<ProviderPurchaseResult> {
    const creds = await this.loadCreds();

    const discoSource = input.provider_variation_code ?? input.network_operator;
    if (!discoSource) {
      throw new Error(
        "NetworkDataSub electricity: disco_id is missing for this plan. " +
          "Set 'Provider Variation Code' to the numeric disco_id from GET /electricity/providers."
      );
    }

    const discoId = parseInt(discoSource, 10);
    if (isNaN(discoId) || discoId <= 0) {
      throw new Error(
        `NetworkDataSub electricity: disco_id '${discoSource}' is not a valid positive integer.`
      );
    }

    if (!input.meter_number) {
      throw new Error("NetworkDataSub electricity purchase requires meter_number");
    }

    if (!input.amount || input.amount < 1000) {
      throw new Error("NetworkDataSub electricity purchase requires amount >= 1000");
    }

    const meterType = resolveMeterTypeCode(input.plan_category);

    const payload = {
      disco_id: discoId,
      meter_number: input.meter_number,
      meter_type: meterType,
      amount: input.amount,
    };

    console.log("[NDS] electricity purchase →", {
      disco_id: discoId,
      meter_type: meterType,
      amount: input.amount,
      meter: maskPhone(input.meter_number),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${creds.baseUrl}/electricity/purchase`, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify(payload),
    });

    this.checkAuthFailure(response, "/electricity/purchase");

    const raw = await this.parseJson<NdsElectricityPurchaseResponse>(
      response,
      "electricity purchase"
    );

    console.log("[NDS] electricity purchase ←", {
      success: raw.success,
      token: raw.data?.token ? "[present]" : "[absent]",
      reference: input.reference,
    });

    const isSuccess = raw.success === true;

    return {
      success: isSuccess,
      provider_reference: raw.data?.reference ?? input.reference,
      provider: this.name,
      message: raw.message ?? (isSuccess ? "Electricity purchase successful" : "Electricity purchase failed"),
      status: isSuccess ? "successful" : "failed",
      raw_response: raw,
    };
  }

  // ── Cable TV (verify only — see purchase() note above) ─────────────────────

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    const creds = await this.loadCreds();

    if (!input.biller_code) {
      throw new Error(
        "NetworkDataSub cable: provider_id is missing. " +
          "Set the plan's network_operator to the numeric provider_id from GET /cable/providers."
      );
    }

    const providerId = parseInt(input.biller_code, 10);
    if (isNaN(providerId) || providerId <= 0) {
      throw new Error(
        `NetworkDataSub cable: provider_id '${input.biller_code}' is not a valid positive integer. ` +
          "Set the plan's network_operator to the numeric provider_id from GET /cable/providers."
      );
    }

    console.log("[NDS] cable verify →", {
      provider_id: providerId,
      smartcard: maskPhone(input.smartcard_number),
    });

    const response = await this.fetchWithTimeout(`${creds.baseUrl}/cable/verify`, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify({
        provider_id: providerId,
        smart_card_number: input.smartcard_number,
      }),
    });

    this.checkAuthFailure(response, "/cable/verify");

    const raw = await this.parseJson<NdsCableVerifyResponse>(response, "cable verify");

    console.log("[NDS] cable verify ←", {
      success: raw.success,
      customer_name: raw.data?.customer_name,
      message: raw.message,
    });

    if (raw.success !== true) {
      return {
        success: false,
        message: raw.message ?? "Smartcard verification failed",
        raw_response: raw,
      };
    }

    return {
      success: true,
      customer_name: raw.data?.customer_name,
      current_package: raw.data?.current_bouquet,
      due_date: raw.data?.due_date,
      smartcard_number: raw.data?.smart_card_number ?? input.smartcard_number,
      message: raw.message ?? "Smartcard verified successfully",
      raw_response: raw,
    };
  }

  // ── Identity (NIN / BVN) ─────────────────────────────────────────────────
  //
  // variation_code must start with "nin" or "bvn". For NIN, plan_category
  // (standard | regular | premium | vnin_slip) selects the card type; for
  // BVN, plan_category (standard | premium). metadata.id_number carries the
  // NIN/BVN digits — same convention as eData's identity_verification path.

  private async purchaseIdentity(
    input: ProviderPurchaseInput
  ): Promise<ProviderPurchaseResult> {
    const creds = await this.loadCreds();

    const variationCode = input.variation_code ?? "";
    const isNin = variationCode.startsWith("nin");
    const isBvn = variationCode.startsWith("bvn");

    if (!isNin && !isBvn) {
      throw new Error(
        `NetworkDataSub identity: cannot resolve id type from variation_code '${variationCode}'. ` +
          `Expected it to start with 'nin' or 'bvn'.`
      );
    }

    const idNumber = (input.metadata?.id_number as string | undefined) ?? undefined;
    if (!idNumber) {
      throw new Error(
        `NetworkDataSub identity: id_number is required (pass the ${isNin ? "NIN" : "BVN"} in metadata.id_number)`
      );
    }

    const cardType = input.plan_category ?? "standard";
    const endpoint = isNin ? "/verification/nin" : "/verification/bvn";
    const bodyKey = isNin ? "nin" : "bvn";

    console.log("[NDS] identity purchase →", {
      id_type: isNin ? "nin" : "bvn",
      card_type: cardType,
      id: maskPhone(idNumber),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${creds.baseUrl}${endpoint}`, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify({ [bodyKey]: idNumber, card_type: cardType }),
    });

    this.checkAuthFailure(response, endpoint);

    const raw = await this.parseJson<NdsIdentityResponse>(response, "identity verification");

    console.log("[NDS] identity purchase ←", {
      success: raw.success,
      has_pdf: raw.data?.has_pdf,
      reference: input.reference,
    });

    const safeResponse = {
      success: raw.success,
      message: raw.message,
      verification_id: raw.data?.verification_id,
      transaction_id: raw.data?.transaction_id,
      reference: raw.data?.reference,
      amount: raw.data?.amount,
    };

    if (raw.success !== true) {
      return {
        success: false,
        provider_reference: raw.data?.reference ?? input.reference,
        provider: this.name,
        message: raw.message ?? "Identity verification failed",
        status: "failed",
        raw_response: safeResponse,
      };
    }

    const d = raw.data?.details ?? {};

    return {
      success: true,
      provider_reference: raw.data?.reference ?? input.reference,
      provider: this.name,
      message: raw.message ?? "Identity verification successful",
      status: "successful",
      raw_response: safeResponse,
      report_data: {
        id_type: isNin ? "nin" : "bvn",
        id_number: idNumber,
        first_name: d.firstName,
        last_name: d.surname ?? d.lastName,
        date_of_birth: d.birthDate ?? d.birthday,
        gender: d.gender,
        phone: d.telephoneNo ?? d.phoneNumber,
        portal_pdf_data: raw.data?.pdf_base64,
      },
    };
  }

  // ── Transaction verification ─────────────────────────────────────────────
  //
  // No requery/verify-transaction endpoint is documented for NetworkDataSub —
  // purchase responses are synchronous (success/failure returned immediately).
  // Mirror eData's honest "not supported" stub rather than guessing an
  // endpoint shape.

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    console.warn(
      "[NDS] verifyTransaction called but no requery endpoint is documented",
      { reference }
    );
    return {
      found: false,
      status: "pending",
      message: "NetworkDataSub does not document a transaction verification endpoint — check the dashboard",
    };
  }

  // ── Balance ───────────────────────────────────────────────────────────────

  async getBalance(): Promise<ProviderBalance> {
    const creds = await this.loadCreds();

    const response = await this.fetchWithTimeout(`${creds.baseUrl}/wallet`, {
      method: "GET",
      headers: this.headers(creds),
    });

    this.checkAuthFailure(response, "/wallet");

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `NetworkDataSub balance check failed with HTTP ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const raw = await this.parseJson<NdsWalletResponse>(response, "wallet");

    console.log("[NDS] wallet raw response:", JSON.stringify(raw));

    const balanceValue = raw.data?.balance ?? raw.data?.wallet_balance ?? 0;

    return {
      available: Number(balanceValue),
      currency: "NGN",
      raw_response: raw,
    };
  }

  // ── Plan / provider listing ──────────────────────────────────────────────
  //
  // Unlike eData (which has no listing API and relies on a hardcoded array),
  // NetworkDataSub documents live GET endpoints for all of these — so pull
  // fresh rather than hand-maintaining a list. Shapes below are confirmed
  // from live responses (2026-09-14), not just the docs page:
  //
  //   GET /electricity/providers → { success, message, data: { providers: [...], total } }
  //   GET /cable/providers       → { success, message, data: { providers: [...], total } }
  //   GET /data/all-plans        → { success, message, data: { plans: [...], pagination, summary }, filters_applied, timestamp }
  //
  // IMPORTANT — unresolved ambiguity: each data plan object carries THREE
  // different ID fields — top-level `id` (e.g. 742), string `plan_id`
  // (e.g. "270"), and `api_info.api_plan_id` (e.g. "9023"). The purchase
  // docs only say the payload field is `data_plan_id` without confirming
  // which of these three it expects. This code defaults to the top-level
  // `id` (most REST APIs key actions off their own primary key). Before
  // relying on this in production: do ONE real purchase with a cheap plan,
  // confirm it succeeds, and adjust dataPlanId() below if NetworkDataSub
  // support says otherwise.

  private dataPlanId(plan: NdsDataPlan): number {
    return plan.id;
  }

  async fetchPlans(
    serviceType: "data" | "cable_tv" | "electricity",
    network?: string
  ): Promise<Array<Record<string, unknown>>> {
    const creds = await this.loadCreds();

    if (serviceType === "electricity") {
      const response = await this.fetchWithTimeout(`${creds.baseUrl}/electricity/providers`, {
        method: "GET",
        headers: this.headers(creds),
      });
      this.checkAuthFailure(response, "/electricity/providers");
      const raw = await this.parseJson<NdsProviderListResponse>(response, "electricity providers");
      if (raw.success !== true) {
        throw new Error(raw.message ?? "NetworkDataSub: failed to fetch electricity providers");
      }
      return (raw.data?.providers as unknown as Array<Record<string, unknown>>) ?? [];
    }

    if (serviceType === "cable_tv") {
      // NOTE: unlike electricity/cable *providers*, the /cable/all-plans
      // (package + price) response shape has not been confirmed live —
      // only /cable/providers has. Verify this shape the same way before
      // trusting it; adjust the `.plans` accessor below if it differs.
      const response = await this.fetchWithTimeout(`${creds.baseUrl}/cable/all-plans`, {
        method: "GET",
        headers: this.headers(creds),
      });
      this.checkAuthFailure(response, "/cable/all-plans");
      const raw = await this.parseJson<NdsErrorEnvelope & { data?: { plans?: unknown } }>(
        response,
        "cable plans"
      );
      if (raw.success !== true) {
        throw new Error(raw.message ?? "NetworkDataSub: failed to fetch cable plans");
      }
      return (raw.data?.plans as Array<Record<string, unknown>>) ?? [];
    }

    // data
    const url = network
      ? `${creds.baseUrl}/data/network/${encodeURIComponent(network)}`
      : `${creds.baseUrl}/data/all-plans`;

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(creds),
    });
    this.checkAuthFailure(response, "/data/all-plans");
    const raw = await this.parseJson<NdsDataPlansResponse>(response, "data plans");
    if (raw.success !== true) {
      throw new Error(raw.message ?? "NetworkDataSub: failed to fetch data plans");
    }

    const plans = raw.data?.plans ?? [];

    // Flatten into the shape Admin > Service Plans needs, surfacing the
    // resolved data_plan_id explicitly so it's obvious what gets stored as
    // provider_variation_code.
    return plans.map((p) => ({
      data_plan_id: this.dataPlanId(p),
      id: p.id,
      plan_id: p.plan_id,
      api_plan_id: p.api_info?.api_plan_id,
      network: p.network?.code,
      plan_name: p.plan_name,
      data_size: p.data_size,
      amount: p.price?.amount,
      validity_days: p.validity?.days,
      plan_type: p.type?.code,
      is_active: p.status?.is_active,
    }));
  }

  /** Returns cable providers with their numeric provider_id (needed for verifyCable's biller_code). */
  async fetchCableProviders(): Promise<Array<Record<string, unknown>>> {
    const creds = await this.loadCreds();
    const response = await this.fetchWithTimeout(`${creds.baseUrl}/cable/providers`, {
      method: "GET",
      headers: this.headers(creds),
    });
    this.checkAuthFailure(response, "/cable/providers");
    const raw = await this.parseJson<NdsProviderListResponse>(response, "cable providers");
    if (raw.success !== true) {
      throw new Error(raw.message ?? "NetworkDataSub: failed to fetch cable providers");
    }
    return (raw.data?.providers as unknown as Array<Record<string, unknown>>) ?? [];
  }

  /** Returns electricity discos with their numeric disco_id (needed for verifyMeter/purchase). */
  async fetchElectricityProviders(): Promise<Array<Record<string, unknown>>> {
    return this.fetchPlans("electricity");
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<ProviderHealthResult> {
    const creds = await getProviderCredentials(this.name);

    if (!creds) {
      return {
        healthy: false,
        message:
          "NetworkDataSub credentials not configured — add base_url and api_key in Admin > API Integrations",
      };
    }

    if (!creds.base_url) {
      return {
        healthy: false,
        message: "NetworkDataSub base_url not set — add in Admin > API Integrations > NetworkDataSub",
      };
    }

    if (!creds.api_key_encrypted) {
      return {
        healthy: false,
        message: "NetworkDataSub api_key not set — add in Admin > API Integrations > NetworkDataSub",
      };
    }

    const start = Date.now();

    try {
      const headers = this.headers({ baseUrl: creds.base_url, apiKey: creds.api_key_encrypted });

      // Use GET /user rather than /wallet for the health ping — it's the
      // lightest documented authenticated endpoint and confirms the token
      // is valid without depending on wallet-specific response shape.
      const response = await this.fetchWithTimeout(`${creds.base_url}/user`, {
        method: "GET",
        headers,
      });

      const latency_ms = Date.now() - start;

      if (response.status === 401) {
        return {
          healthy: false,
          latency_ms,
          message: "NetworkDataSub: HTTP 401 on /user — invalid or expired api_key",
        };
      }

      if (!response.ok) {
        return {
          healthy: false,
          latency_ms,
          message: `NetworkDataSub health check failed with HTTP ${response.status}`,
        };
      }

      const raw = await this.parseJson<NdsUserResponse>(response, "user");

      if (raw.success !== true) {
        return {
          healthy: false,
          latency_ms,
          message: raw.message ?? "NetworkDataSub: /user returned success=false",
        };
      }

      return {
        healthy: true,
        latency_ms,
        message: "NetworkDataSub reachable and credentials valid",
      };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const latency_ms = Date.now() - start;

      if (msg.includes("timed out")) {
        return {
          healthy: false,
          latency_ms,
          message: "NetworkDataSub health check timed out — check base_url",
        };
      }

      if (
        msg.includes("network error") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("ECONNREFUSED")
      ) {
        return {
          healthy: false,
          latency_ms,
          message: "NetworkDataSub network unreachable — check base_url",
        };
      }

      return {
        healthy: false,
        latency_ms,
        message: `NetworkDataSub health check failed: ${msg}`,
      };
    }
  }
}
