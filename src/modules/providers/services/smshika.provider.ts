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

const SMSHIKA_TIMEOUT_MS = 30_000;

// ── Plan lists ────────────────────────────────────────────────────────────────
//
// SMShika does not expose a plan-list API endpoint.
// Plans are sourced from their dashboard docs and stored here.
// TODO: populate from SMShika docs (same format as LegitDataWay).
const DATA_PLAN_LIST: Array<Record<string, unknown>> = [
  // ── MTN SME ──────────────────────────────────────────────────────────────────
  { id:  1, network: "mtn", plan_type: "SME",       plan: "1GB weekly",   amount:   420, month_validate: "7 days"  },
  { id:  2, network: "mtn", plan_type: "SME",       plan: "2GB weekly",   amount:   850, month_validate: "7 days"  },
  { id:  3, network: "mtn", plan_type: "SME",       plan: "5GB monthly",  amount:  1500, month_validate: "30 days" },
  { id:  4, network: "mtn", plan_type: "SME",       plan: "10GB monthly", amount:  4600, month_validate: "30 days" },
  { id: 29, network: "mtn", plan_type: "SME",       plan: "500MB weekly", amount:   290, month_validate: "7 days"  },
  { id: 30, network: "mtn", plan_type: "SME",       plan: "3GB monthly",  amount:  1000, month_validate: "30 days" },
  // ── MTN GIFTING ──────────────────────────────────────────────────────────────
  { id:  5, network: "mtn", plan_type: "GIFTING",   plan: "1GB",          amount:   480, month_validate: "10 days" },
  { id:  6, network: "mtn", plan_type: "GIFTING",   plan: "2GB monthly",  amount:   800, month_validate: "30 days" },
  { id:  7, network: "mtn", plan_type: "GIFTING",   plan: "3GB monthly",  amount:  1100, month_validate: "30 days" },
  { id: 75, network: "mtn", plan_type: "GIFTING",   plan: "500MB weekly", amount:   270, month_validate: "7 days"  },
  // ── MTN CORPORATE ────────────────────────────────────────────────────────────
  { id: 31, network: "mtn", plan_type: "CORPORATE", plan: "1GB monthly",  amount:   500, month_validate: "30 days" },
  { id: 32, network: "mtn", plan_type: "CORPORATE", plan: "500MB monthly",amount:   300, month_validate: "30 days" },
  { id: 33, network: "mtn", plan_type: "CORPORATE", plan: "2GB monthly",  amount:   850, month_validate: "30 days" },
  { id: 34, network: "mtn", plan_type: "CORPORATE", plan: "3GB monthly",  amount:  1100, month_validate: "30 days" },
  { id: 35, network: "mtn", plan_type: "CORPORATE", plan: "5GB monthly",  amount:  1100, month_validate: "30 days" },
  // ── MTN SME 2 ────────────────────────────────────────────────────────────────
  { id: 76, network: "mtn", plan_type: "SME 2",     plan: "1GB daily",    amount:   250, month_validate: "1 days"  },

  // ── AIRTEL SME ───────────────────────────────────────────────────────────────
  { id:  8, network: "airtel", plan_type: "SME",       plan: "1GB 3-days",    amount:   330, month_validate: "3 days"  },
  { id:  9, network: "airtel", plan_type: "SME",       plan: "2GB",           amount:   500, month_validate: "1 days"  },
  { id: 10, network: "airtel", plan_type: "SME",       plan: "5GB weekly",    amount:  1600, month_validate: "7 days"  },
  { id: 11, network: "airtel", plan_type: "SME",       plan: "10GB monthly",  amount:  3150, month_validate: "30 days" },
  { id: 60, network: "airtel", plan_type: "SME",       plan: "500MB 2 days",  amount:   300, month_validate: "2 days"  },
  { id: 61, network: "airtel", plan_type: "SME",       plan: "150MB 2 days",  amount:   120, month_validate: "2 days"  },
  { id: 62, network: "airtel", plan_type: "SME",       plan: "300MB 3 days",  amount:   155, month_validate: "3 days"  },
  // ── AIRTEL GIFTING ───────────────────────────────────────────────────────────
  { id: 12, network: "airtel", plan_type: "GIFTING",   plan: "150MB",         amount:    80, month_validate: "1 days"  },
  { id: 13, network: "airtel", plan_type: "GIFTING",   plan: "300MB",         amount:   150, month_validate: "2 days"  },
  { id: 14, network: "airtel", plan_type: "GIFTING",   plan: "600MB",         amount:   300, month_validate: "2 days"  },
  { id: 68, network: "airtel", plan_type: "GIFTING",   plan: "1.5GB 2 days",  amount:   500, month_validate: "2 days"  },
  { id: 69, network: "airtel", plan_type: "GIFTING",   plan: "3.2GB 3 days",  amount:   550, month_validate: "3 days"  },
  { id: 73, network: "airtel", plan_type: "GIFTING",   plan: "10GB monthly",  amount:  3200, month_validate: "30 days" },
  { id: 74, network: "airtel", plan_type: "GIFTING",   plan: "13GB monthly",  amount:  5100, month_validate: "30 days" },
  // ── AIRTEL CORPORATE ─────────────────────────────────────────────────────────
  { id: 36, network: "airtel", plan_type: "CORPORATE", plan: "500MB weekly",  amount:   500, month_validate: "7 days"  },
  { id: 37, network: "airtel", plan_type: "CORPORATE", plan: "1GB weekly",    amount:   750, month_validate: "7 days"  },
  { id: 38, network: "airtel", plan_type: "CORPORATE", plan: "2GB 2 days",    amount:   750, month_validate: "2 days"  },
  { id: 39, network: "airtel", plan_type: "CORPORATE", plan: "1.5GB weekly",  amount:  1050, month_validate: "7 days"  },
  { id: 40, network: "airtel", plan_type: "CORPORATE", plan: "2GB monthly",   amount:  1500, month_validate: "30 days" },
  { id: 41, network: "airtel", plan_type: "CORPORATE", plan: "4GB weekly",    amount:  1500, month_validate: "7 days"  },
  { id: 42, network: "airtel", plan_type: "CORPORATE", plan: "3GB monthly",   amount:  2000, month_validate: "30 days" },
  { id: 43, network: "airtel", plan_type: "CORPORATE", plan: "6GB weekly",    amount:  2500, month_validate: "7 days"  },
  { id: 44, network: "airtel", plan_type: "CORPORATE", plan: "10GB weekly",   amount:  3000, month_validate: "7 days"  },
  { id: 45, network: "airtel", plan_type: "CORPORATE", plan: "8GB monthly",   amount:  3000, month_validate: "30 days" },
  { id: 47, network: "airtel", plan_type: "CORPORATE", plan: "4GB monthly",   amount:  2500, month_validate: "30 days" },
  { id: 52, network: "airtel", plan_type: "CORPORATE", plan: "10GB monthly",  amount:  4000, month_validate: "30 days" },
  { id: 63, network: "airtel", plan_type: "CORPORATE", plan: "1.5GB",         amount:   475, month_validate: "1 days"  },
  { id: 64, network: "airtel", plan_type: "CORPORATE", plan: "150MB",         amount:   110, month_validate: "1 days"  },
  { id: 65, network: "airtel", plan_type: "CORPORATE", plan: "500MB 2 days",  amount:   275, month_validate: "2 days"  },
  { id: 66, network: "airtel", plan_type: "CORPORATE", plan: "300MB 2 days",  amount:   165, month_validate: "2 days"  },
  { id: 67, network: "airtel", plan_type: "CORPORATE", plan: "300MB 2 days B",amount:   165, month_validate: "2 days"  },
  { id: 70, network: "airtel", plan_type: "CORPORATE", plan: "3GB 2 days",    amount:   850, month_validate: "2 days"  },

  // ── GLO GIFTING ──────────────────────────────────────────────────────────────
  { id: 21, network: "glo", plan_type: "GIFTING",   plan: "5GB monthly",  amount:  1450, month_validate: "30 days" },
  { id: 55, network: "glo", plan_type: "GIFTING",   plan: "2.3GB 2 days", amount:  1045, month_validate: "2 days"  },
  { id: 56, network: "glo", plan_type: "GIFTING",   plan: "8.5GB weekly", amount:  2000, month_validate: "7 days"  },
  { id: 57, network: "glo", plan_type: "GIFTING",   plan: "3.5GB weekly", amount:  1050, month_validate: "7 days"  },
  { id: 58, network: "glo", plan_type: "GIFTING",   plan: "5GB weekly",   amount:  1500, month_validate: "7 days"  },
  { id: 59, network: "glo", plan_type: "GIFTING",   plan: "1.5GB weekly", amount:   500, month_validate: "7 days"  },
  // ── GLO CORPORATE ────────────────────────────────────────────────────────────
  { id: 46, network: "glo", plan_type: "CORPORATE", plan: "1GB monthly",  amount:   425, month_validate: "30 days" },
  { id: 48, network: "glo", plan_type: "CORPORATE", plan: "2GB monthly",  amount:   850, month_validate: "30 days" },
  { id: 49, network: "glo", plan_type: "CORPORATE", plan: "3GB monthly",  amount:  1275, month_validate: "30 days" },
  { id: 50, network: "glo", plan_type: "CORPORATE", plan: "5GB monthly",  amount:  2125, month_validate: "30 days" },
  { id: 51, network: "glo", plan_type: "CORPORATE", plan: "10GB monthly", amount:  4400, month_validate: "30 days" },
  { id: 53, network: "glo", plan_type: "CORPORATE", plan: "500MB monthly",amount:   235, month_validate: "30 days" },
  { id: 54, network: "glo", plan_type: "CORPORATE", plan: "200MB monthly",amount:   135, month_validate: "30 days" },

  // ── 9MOBILE SME ──────────────────────────────────────────────────────────────
  { id: 22, network: "9mobile", plan_type: "SME",     plan: "1GB monthly",  amount:   265, month_validate: "30 days" },
  { id: 23, network: "9mobile", plan_type: "SME",     plan: "2GB monthly",  amount:   530, month_validate: "30 days" },
  { id: 24, network: "9mobile", plan_type: "SME",     plan: "5GB monthly",  amount:  1325, month_validate: "30 days" },
  { id: 25, network: "9mobile", plan_type: "SME",     plan: "10GB monthly", amount:  2650, month_validate: "30 days" },
  // ── 9MOBILE GIFTING ──────────────────────────────────────────────────────────
  { id: 26, network: "9mobile", plan_type: "GIFTING", plan: "1GB monthly",  amount:   285, month_validate: "30 days" },
  { id: 27, network: "9mobile", plan_type: "GIFTING", plan: "2GB monthly",  amount:   570, month_validate: "30 days" },
  { id: 28, network: "9mobile", plan_type: "GIFTING", plan: "5GB monthly",  amount:  1425, month_validate: "30 days" },
];

// plan_code is the numeric ID as a string — this becomes both variation_code and
// provider_variation_code after import, and is parsed back to an int for plan_id in purchaseCable.
const CABLE_TV_PLAN_LIST: Array<Record<string, unknown>> = [
  // ── DSTV ─────────────────────────────────────────────────────────────────────
  { plan_code: "1",  name: "DStv Compact",      operator: "dstv",      amount:  8500 },
  { plan_code: "2",  name: "DStv Compact Plus",  operator: "dstv",      amount: 13500 },
  { plan_code: "3",  name: "DStv Premium",       operator: "dstv",      amount: 26500 },
  { plan_code: "4",  name: "DStv Confam",        operator: "dstv",      amount:  6500 },
  // ── GOTV ─────────────────────────────────────────────────────────────────────
  { plan_code: "5",  name: "GOtv Smallie",       operator: "gotv",      amount:  1500 },
  { plan_code: "6",  name: "GOtv Jinja",         operator: "gotv",      amount:  2900 },
  { plan_code: "7",  name: "GOtv Jolli",         operator: "gotv",      amount:  4200 },
  { plan_code: "8",  name: "GOtv Max",           operator: "gotv",      amount:  5500 },
  // ── STARTIMES ────────────────────────────────────────────────────────────────
  { plan_code: "9",  name: "StarTimes Nova",     operator: "startimes", amount:  1500 },
  { plan_code: "10", name: "StarTimes Basic",    operator: "startimes", amount:  2900 },
  { plan_code: "11", name: "StarTimes Smart",    operator: "startimes", amount:  4200 },
  { plan_code: "12", name: "StarTimes Classic",  operator: "startimes", amount:  5500 },
  // ── SHOWMAX ──────────────────────────────────────────────────────────────────
  { plan_code: "13", name: "ShowMax Mobile",     operator: "showmax",   amount:  1500 },
  { plan_code: "14", name: "ShowMax Pro",        operator: "showmax",   amount:  2900 },
];

// Electricity DISCO list — provider_code is the SMShika string disco code.
// Each DISCO offers prepaid and postpaid. Amounts are 0 (variable at purchase).
const ELECTRICITY_DISCO_LIST: Array<Record<string, unknown>> = [
  { plan_code: "ekedc-prepaid",   name: "EKEDC Prepaid",     operator: "ekedc",  plan_category: "prepaid",  provider_code: "ekedc"  },
  { plan_code: "ekedc-postpaid",  name: "EKEDC Postpaid",    operator: "ekedc",  plan_category: "postpaid", provider_code: "ekedc"  },
  { plan_code: "ikedc-prepaid",   name: "IKEDC Prepaid",     operator: "ikedc",  plan_category: "prepaid",  provider_code: "ikedc"  },
  { plan_code: "ikedc-postpaid",  name: "IKEDC Postpaid",    operator: "ikedc",  plan_category: "postpaid", provider_code: "ikedc"  },
  { plan_code: "aedc-prepaid",    name: "AEDC Prepaid",      operator: "aedc",   plan_category: "prepaid",  provider_code: "aedc"   },
  { plan_code: "aedc-postpaid",   name: "AEDC Postpaid",     operator: "aedc",   plan_category: "postpaid", provider_code: "aedc"   },
  { plan_code: "kedco-prepaid",   name: "KEDCO Prepaid",     operator: "kedco",  plan_category: "prepaid",  provider_code: "kedco"  },
  { plan_code: "kedco-postpaid",  name: "KEDCO Postpaid",    operator: "kedco",  plan_category: "postpaid", provider_code: "kedco"  },
  { plan_code: "phed-prepaid",    name: "PHED Prepaid",      operator: "phed",   plan_category: "prepaid",  provider_code: "phed"   },
  { plan_code: "phed-postpaid",   name: "PHED Postpaid",     operator: "phed",   plan_category: "postpaid", provider_code: "phed"   },
  { plan_code: "jedc-prepaid",    name: "JEDC Prepaid",      operator: "jedc",   plan_category: "prepaid",  provider_code: "jedc"   },
  { plan_code: "jedc-postpaid",   name: "JEDC Postpaid",     operator: "jedc",   plan_category: "postpaid", provider_code: "jedc"   },
  { plan_code: "ibedc-prepaid",   name: "IBEDC Prepaid",     operator: "ibedc",  plan_category: "prepaid",  provider_code: "ibedc"  },
  { plan_code: "ibedc-postpaid",  name: "IBEDC Postpaid",    operator: "ibedc",  plan_category: "postpaid", provider_code: "ibedc"  },
  { plan_code: "kaedc-prepaid",   name: "KAEDC Prepaid",     operator: "kaedc",  plan_category: "prepaid",  provider_code: "kaedc"  },
  { plan_code: "kaedc-postpaid",  name: "KAEDC Postpaid",    operator: "kaedc",  plan_category: "postpaid", provider_code: "kaedc"  },
  { plan_code: "eedc-prepaid",    name: "EEDC Prepaid",      operator: "eedc",   plan_category: "prepaid",  provider_code: "eedc"   },
  { plan_code: "eedc-postpaid",   name: "EEDC Postpaid",     operator: "eedc",   plan_category: "postpaid", provider_code: "eedc"   },
  { plan_code: "bedc-prepaid",    name: "BEDC Prepaid",      operator: "bedc",   plan_category: "prepaid",  provider_code: "bedc"   },
  { plan_code: "bedc-postpaid",   name: "BEDC Postpaid",     operator: "bedc",   plan_category: "postpaid", provider_code: "bedc"   },
  { plan_code: "yedc-prepaid",    name: "YEDC Prepaid",      operator: "yedc",   plan_category: "prepaid",  provider_code: "yedc"   },
  { plan_code: "yedc-postpaid",   name: "YEDC Postpaid",     operator: "yedc",   plan_category: "postpaid", provider_code: "yedc"   },
  { plan_code: "aba-prepaid",     name: "ABA/APLE Prepaid",  operator: "aba",    plan_category: "prepaid",  provider_code: "aba"    },
  { plan_code: "aba-postpaid",    name: "ABA/APLE Postpaid", operator: "aba",    plan_category: "postpaid", provider_code: "aba"    },
];

// ── Operator mapping ──────────────────────────────────────────────────────────
//
// Airtime uses string network names; data uses integer network IDs.
// variation_code prefix (e.g. "mtn-airtime", "mtn-1gb-30") is the source.

const AIRTIME_NETWORK_MAP: Record<string, string> = {
  mtn:       "MTN",
  airtel:    "Airtel",
  glo:       "Glo",
  "9mobile": "9mobile",
  etisalat:  "9mobile",   // legacy alias
};

// SMShika data API network IDs (documented at /api/data/ endpoint):
//   1 = MTN  |  2 = Glo  |  3 = 9mobile  |  4 = Airtel
const DATA_NETWORK_ID_MAP: Record<string, number> = {
  mtn:       1,
  glo:       2,
  "9mobile": 3,
  etisalat:  3,           // legacy alias
  airtel:    4,
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

interface SmshikaMeterVerifyResponse {
  Status?:         string;
  status?:         string;
  success?:        boolean;
  Customer_Name?:  string;
  Address?:        string;
  Meter_Number?:   string;
  message?:        string;
  data?: {
    customer_name?:    string;
    customer_address?: string;
    tariff_class?:     string;
  };
}

interface SmshikaElectricityResponse {
  Status?:        string;
  status?:        string;
  message?:       string;
  token?:         string;
  units?:         string | number;
  api_response?:  { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

interface SmshikaCableVerifyResponse {
  Status?:          string;
  status?:          string;
  Customer_Name?:   string;
  customer_name?:   string;
  Current_Bouquet?: string;
  current_bouquet?: string;
  Bouquet?:         string;
  Due_Date?:        string;
  due_date?:        string;
  Smartcard_Number?: string;
  smartcard_number?: string;
  message?:         string;
}

interface SmshikaCablePurchaseResponse {
  Status?:        string;
  status?:        string;
  message?:       string;
  Customer_Name?: string;
  customer_name?: string;
  Package?:       string;
  package?:       string;
  Bouquet?:       string;
  bouquet?:       string;
  Due_Date?:      string;
  due_date?:      string;
  api_response?:  { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extracts the network prefix from a variation_code (e.g. "mtn-airtime" → "mtn"). */
function extractPrefix(variationCode: string): string {
  return variationCode.split("-")[0].toLowerCase();
}

/** Resolves SMShika string network name for airtime. */
function resolveAirtimeNetwork(variationCode: string): string | null {
  return AIRTIME_NETWORK_MAP[extractPrefix(variationCode)] ?? null;
}

/** Resolves SMShika integer network ID for data. */
function resolveDataNetworkId(variationCode: string): number | null {
  const id = DATA_NETWORK_ID_MAP[extractPrefix(variationCode)];
  return id !== undefined ? id : null;
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
    const creds = await this.requireCredentials();

    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey) {
      throw new Error("SMShika: api_key not set — add it in Admin > API Integrations > SMShika");
    }
    if (!baseUrl) {
      throw new Error("SMShika: base_url not set — add it in Admin > API Integrations > SMShika");
    }

    if (input.service_type === "airtime") {
      return this.purchaseAirtime(input, apiKey, baseUrl);
    }
    if (input.service_type === "data") {
      return this.purchaseData(input, apiKey, baseUrl);
    }
    if (input.service_type === "electricity") {
      return this.purchaseElectricity(input, apiKey, baseUrl);
    }
    if (input.service_type === "cable_tv") {
      return this.purchaseCable(input, apiKey, baseUrl);
    }

    throw new Error(
      `SMShika: service_type '${input.service_type}' not implemented. ` +
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
    const network = resolveAirtimeNetwork(variationCode);

    if (!network) {
      throw new Error(
        `SMShika airtime: cannot resolve network for variation_code '${variationCode}'. ` +
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

    console.log("[SMSHIKA] airtime purchase →", {
      network,
      amount:    input.amount,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/topup`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `SMShika airtime: HTTP ${response.status} authentication failure — verify api_key`
      );
    }

    const raw = await this.parseJson<SmshikaTopupResponse>(response, "airtime topup");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[SMSHIKA] airtime purchase ←", {
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

  // ── Data ─────────────────────────────────────────────────────────────────

  private async purchaseData(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    // provider_variation_code MUST be a numeric plan ID from SMShika's plan list.
    const rawPlanId = input.provider_variation_code ?? null;
    if (!rawPlanId) {
      throw new Error(
        "SMShika data: Provider plan ID is missing for this plan. " +
        "Go to Admin → Service Plans, find this data plan, and set " +
        "'Provider Variation Code' to the numeric plan ID from your SMShika plan list."
      );
    }
    const planId = parseInt(rawPlanId, 10);
    if (isNaN(planId) || planId <= 0) {
      throw new Error(
        `SMShika data: Provider plan ID '${rawPlanId}' is not a valid positive integer. ` +
        "Update the plan in Admin → Service Plans with the correct numeric SMShika plan ID."
      );
    }

    const variationCode = input.variation_code ?? "";
    const networkId = resolveDataNetworkId(variationCode);
    if (networkId === null) {
      throw new Error(
        `SMShika data: cannot resolve network ID for variation_code '${variationCode}'. ` +
        `Expected prefix: mtn | glo | 9mobile | airtel`
      );
    }

    const payload = {
      network:       networkId,
      mobile_number: input.phone ?? "",
      plan:          planId,
      Ported_number: false,
    };

    console.log("[SMSHIKA] data purchase →", {
      network:   networkId,
      plan:      planId,
      amount:    input.amount,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/data/`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `SMShika data: HTTP ${response.status} authentication failure — verify api_key`
      );
    }

    const raw = await this.parseJson<SmshikaTopupResponse>(response, "data purchase");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[SMSHIKA] data purchase ←", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Data purchase successful" : "Data purchase failed"),
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

  // ── Electricity ───────────────────────────────────────────────────────────

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("SMShika: api_key not set — add it in Admin > API Integrations > SMShika");
    if (!baseUrl) throw new Error("SMShika: base_url not set — add it in Admin > API Integrations > SMShika");

    if (!input.disco_name) {
      throw new Error(
        "SMShika electricity: disco_name (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the SMShika disco name (e.g. ikeja-electric)."
      );
    }

    const payload = {
      provider_code: input.disco_name,
      meter_number:  input.meter_number,
      meter_type:    input.meter_type,
    };

    console.log("[SMSHIKA] meter verify →", {
      provider_code: input.disco_name,
      meter_type:    input.meter_type,
      meter:         maskPhone(input.meter_number),
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/electricity/verify`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`SMShika meter verify: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<SmshikaMeterVerifyResponse>(response, "meter verify");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = raw.success === true || SUCCESS_VALUES.has(rawStatusLower);

    const customerName = raw.Customer_Name ?? raw.data?.customer_name ?? "";
    const address      = raw.Address ?? raw.data?.customer_address;

    console.log("[SMSHIKA] meter verify ←", {
      status:        raw.status,
      Status:        raw.Status,
      success:       raw.success,
      customer_name: customerName,
      message:       raw.message,
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
      address,
      meter_number:  raw.Meter_Number ?? input.meter_number,
      message:       raw.message ?? "Meter verified successfully",
      raw_response:  raw,
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
        "SMShika electricity: disco_name (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the SMShika disco name (e.g. ikeja-electric)."
      );
    }

    const meterType = input.plan_category ?? "prepaid";

    const payload = {
      provider_code: discoName,
      meter_number:  input.meter_number ?? "",
      meter_type:    meterType,
      amount:        input.amount,
      phone:         input.phone ?? "",
    };

    console.log("[SMSHIKA] electricity purchase →", {
      provider_code: discoName,
      meter_type:    meterType,
      amount:        input.amount,
      meter:         maskPhone(input.meter_number),
      reference:     input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/electricity/`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`SMShika electricity: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<SmshikaElectricityResponse>(response, "electricity purchase");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[SMSHIKA] electricity purchase ←", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      token:     raw.token ? "[present]" : "[absent]",
      reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Electricity purchase successful" : "Electricity purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       {
        status:         raw.status,
        Status:         raw.Status,
        message:        raw.message,
        token:          raw.token,
        units:          raw.units,
        api_response:   raw.api_response,
        balance_before: raw.balance_before,
        balance_after:  raw.balance_after,
      },
    };
  }

  // ── Cable TV ──────────────────────────────────────────────────────────────

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("SMShika: api_key not set — add it in Admin > API Integrations > SMShika");
    if (!baseUrl) throw new Error("SMShika: base_url not set — add it in Admin > API Integrations > SMShika");

    if (!input.biller_code) {
      throw new Error(
        "SMShika cable: biller_code is missing. " +
        "Ensure the plan has a network_operator set (e.g. dstv, gotv, startimes)."
      );
    }

    const payload = {
      smartcard: input.smartcard_number,
      provider:  input.biller_code.toUpperCase(),
    };

    console.log("[SMSHIKA] cable verify →", {
      biller:   input.biller_code,
      smartcard: maskPhone(input.smartcard_number),
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/cable/verify`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`SMShika cable verify: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<SmshikaCableVerifyResponse>(response, "cable verify");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[SMSHIKA] cable verify ←", {
      status:        raw.status,
      Status:        raw.Status,
      Customer_Name: raw.Customer_Name,
      message:       raw.message,
    });

    if (!isSuccess) {
      return {
        success:  false,
        message:  raw.message ?? "Decoder verification failed",
        raw_response: raw,
      };
    }

    const currentPackage = raw.Current_Bouquet ?? raw.current_bouquet ?? raw.Bouquet ?? undefined;

    return {
      success:          true,
      customer_name:    raw.Customer_Name ?? raw.customer_name ?? undefined,
      current_package:  currentPackage,
      due_date:         raw.Due_Date ?? raw.due_date ?? undefined,
      smartcard_number: raw.Smartcard_Number ?? raw.smartcard_number ?? input.smartcard_number,
      message:          raw.message ?? "Decoder verified successfully",
      raw_response:     raw,
    };
  }

  private async purchaseCable(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const variationCode = input.provider_variation_code ?? input.variation_code ?? null;
    if (!variationCode) {
      throw new Error(
        "SMShika cable: plan ID is missing. " +
        "Go to Admin → Service Plans, find this plan, and ensure " +
        "'Provider Plan ID / Variation Code' is set to the SMShika numeric plan ID."
      );
    }
    const planId = parseInt(variationCode, 10);
    if (isNaN(planId) || planId <= 0) {
      throw new Error(
        `SMShika cable: plan ID '${variationCode}' is not a valid positive integer. ` +
        "Update the plan in Admin → Service Plans with the correct numeric SMShika cable plan ID."
      );
    }

    const payload = {
      plan_id:         planId,
      smartcard_number: input.smartcard_number ?? "",
      phone:           input.phone ?? "",
    };

    console.log("[SMSHIKA] cable purchase →", {
      plan_id:  planId,
      smartcard: maskPhone(input.smartcard_number),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/cable/`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`SMShika cable: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<SmshikaCablePurchaseResponse>(response, "cable purchase");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[SMSHIKA] cable purchase ←", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      reference: input.reference,
    });

    const packageName = raw.Package ?? raw.package ?? raw.Bouquet ?? raw.bouquet ?? undefined;

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Cable TV subscription successful" : "Cable TV subscription failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       {
        status:         raw.status,
        Status:         raw.Status,
        message:        raw.message,
        Customer_Name:  raw.Customer_Name ?? raw.customer_name,
        package:        packageName,
        Due_Date:       raw.Due_Date ?? raw.due_date,
        api_response:   raw.api_response,
        balance_before: raw.balance_before,
        balance_after:  raw.balance_after,
      },
    };
  }

  // ── Plan listing ─────────────────────────────────────────────────────────

  async fetchPlans(
    serviceType: "data" | "cable_tv" | "electricity",
    network?:    string,
  ): Promise<Array<Record<string, unknown>>> {
    if (serviceType === "cable_tv") {
      return CABLE_TV_PLAN_LIST;
    }
    if (serviceType === "electricity") {
      return ELECTRICITY_DISCO_LIST;
    }

    if (DATA_PLAN_LIST.length === 0) {
      throw new Error(
        "SMShika data plan list has not been populated yet. " +
        "Share the SMShika dashboard plan data to add plans.",
      );
    }

    const plans = network
      ? DATA_PLAN_LIST.filter((p) => String(p.network).toLowerCase() === network.toLowerCase())
      : DATA_PLAN_LIST;

    if (plans.length === 0 && network) {
      const available = [...new Set(DATA_PLAN_LIST.map((p) => p.network))].join(", ");
      throw new Error(
        `No SMShika plans available for network '${network}'. Available: ${available}.`,
      );
    }

    return plans;
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
