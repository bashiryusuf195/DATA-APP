import { createHmac } from "crypto";
import { config } from "../../../config";
import { logger } from "../../../lib/logger";
import type {
  PaymentGateway,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
  GatewayPaymentStatus,
} from "../types/payment-gateway.types";

const TIMEOUT_MS = 15_000;

// ── Gateway config ────────────────────────────────────────────────────────────

interface SquadGatewayConfig {
  secretKey:      string;
  baseUrl:        string;
  webhookSecret?: string;
  callbackUrl?:   string;
}

// ── Internal response shapes ──────────────────────────────────────────────────

interface SquadBaseResponse {
  status:  number;
  success: boolean;
  message: string;
}

interface SquadVirtualAccountResponse extends SquadBaseResponse {
  data: {
    customer_identifier:    string;
    first_name:             string;
    last_name:              string;
    mobile_num:             string;
    email:                  string;
    virtual_account_number: string;
    account_name?:          string;
    bank_code:              string;
    bank_name:              string;
    is_active:              boolean;
    created_at:             string;
  };
}

interface SquadBusinessVirtualAccountResponse extends SquadBaseResponse {
  data: {
    customer_identifier:    string;
    business_name:          string;
    virtual_account_number: string;
    account_name?:          string;
    bank_code:              string;
    bank_name:              string;
    is_active:              boolean;
    created_at:             string;
    [key: string]: unknown;
  };
}

interface SquadInitializeResponse extends SquadBaseResponse {
  data: {
    checkout_url:    string;
    transaction_ref: string;  // Squad's own internal ref (SQ_...)
    amount:          number;
    currency:        string;
    merchant_info?:  Record<string, unknown>;
  };
}

interface SquadVerifyResponse extends SquadBaseResponse {
  data: {
    transaction_ref:    string;         // Squad's internal ref
    merchant_ref:       string;         // Our app reference
    gateway_ref:        string | null;
    transaction_status: string;         // "success" | "failed" | "pending"
    email:              string;
    merchant_amount:    number;         // In kobo — what we charged
    transaction_amount: number;         // In kobo — including any Squad fees
    currency:           string;
    payment_type:       string | null;
    channel:            string | null;
    paid_at:            string | null;
    meta?:              Record<string, unknown>;
  };
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface SquadVirtualAccountDetails {
  customer_identifier:    string;
  virtual_account_number: string;
  account_name:           string;
  bank_name:              string;
  bank_code:              string;
}

export interface SquadBusinessVirtualAccountDetails {
  customer_identifier:    string;
  business_name:          string;
  virtual_account_number: string;
  account_name:           string;
  bank_name:              string;
  bank_code:              string;
}

export interface CreateVirtualAccountParams {
  customer_identifier:  string;
  first_name:           string;
  last_name:            string;
  mobile_num:           string;
  email:                string;
  bvn?:                 string;
  dob?:                 string;   // MM/DD/YYYY
  address?:             string;
  gender?:              string;   // "1" = male, "2" = female
  beneficiary_account?: string;   // merchant settlement account (required by Squad)
}

export interface CreateBusinessVirtualAccountParams {
  customer_identifier:  string;
  business_name:        string;
  mobile_num:           string;
  bvn:                  string;
  bank_code?:           string;
  beneficiary_account?: string;
}

export interface SimulateVirtualAccountPaymentParams {
  virtual_account_number: string;
  amount:                 number;   // NGN (e.g. 5000 = ₦5,000)
  payment_date?:          string;   // ISO date string
  bank_code?:             string;
}

export interface VirtualAccountTransactionQueryOptions {
  page?:      number;
  perPage?:   number;
  startDate?: string;  // YYYY-MM-DD
  endDate?:   string;
}

export interface MerchantTransactionQueryOptions extends VirtualAccountTransactionQueryOptions {
  virtual_account_number?: string;
}

// ── SquadGateway ──────────────────────────────────────────────────────────────

class SquadGateway implements PaymentGateway {
  readonly name = "squad";
  private readonly cfg: SquadGatewayConfig;

  constructor(cfg?: Partial<SquadGatewayConfig>) {
    this.cfg = {
      secretKey:     cfg?.secretKey     ?? config.squad.secretKey,
      baseUrl:       cfg?.baseUrl       ?? config.squad.baseUrl,
      webhookSecret: cfg?.webhookSecret ?? config.squad.webhookSecret,
      callbackUrl:   cfg?.callbackUrl   ?? config.squad.callbackUrl,
    };
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.secretKey);
  }

  // For GET requests payload is appended as query params; for POST it becomes the body.
  private async request<T>(
    method:   "GET" | "POST",
    path:     string,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let url  = `${this.cfg.baseUrl}${path}`;
    let body: string | undefined;

    if (method === "GET" && payload) {
      const qs = new URLSearchParams(
        Object.entries(payload)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)] as [string, string])
      ).toString();
      if (qs) url += `?${qs}`;
    } else if (method === "POST" && payload) {
      body = JSON.stringify(payload);
    }

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${this.cfg.secretKey}`,
          "Content-Type":  "application/json",
        },
        body,
        signal: ctrl.signal,
      });

      // Parse defensively — Squad occasionally returns non-JSON on gateway errors.
      const json = await res.json().catch(() => null) as T | null;

      if (!res.ok) {
        const msg = (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
        logger.error("squad_api_error", {
          method,
          path,
          http_status:   res.status,
          response_body: json,
          base_url:      this.cfg.baseUrl,
        });
        throw new Error(`Squad ${method} ${path} failed: ${msg}`);
      }

      if (!json) {
        throw new Error(`Squad ${method} ${path}: unexpected empty response`);
      }

      return json;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`Squad request timed out: ${method} ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── PaymentGateway interface ──────────────────────────────────────────────

  async initializePayment(
    params: InitializePaymentParams
  ): Promise<InitializePaymentResult> {
    if (!this.isConfigured()) {
      throw new Error("Squad is not configured — SQUAD_SECRET_KEY missing");
    }

    const res = await this.request<SquadInitializeResponse>("POST", "/transaction/initiate", {
      email:           params.email,
      amount:          params.amount_kobo,
      currency:        "NGN",
      initiate_type:   "inline",
      transaction_ref: params.reference,
      callback_url:    params.callback_url ?? (this.cfg.callbackUrl || undefined),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });

    if (!res.success) {
      throw new Error(`Squad initialization failed: ${res.message}`);
    }

    return {
      authorization_url: res.data.checkout_url,
      access_code:       res.data.transaction_ref,  // Squad's internal ref
      reference:         params.reference,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      throw new Error("Squad is not configured — SQUAD_SECRET_KEY missing");
    }

    const res = await this.request<SquadVerifyResponse>(
      "GET",
      `/transaction/verify/${encodeURIComponent(reference)}`
    );

    if (!res.success) {
      throw new Error(`Squad verify failed: ${res.message}`);
    }

    const d = res.data;

    const statusMap: Record<string, GatewayPaymentStatus> = {
      success: "success",
      failed:  "failed",
      pending: "pending",
    };

    return {
      status:            statusMap[d.transaction_status?.toLowerCase()] ?? "failed",
      amount_kobo:       d.merchant_amount,
      currency:          d.currency,
      channel:           d.channel ?? d.payment_type ?? null,
      gateway_reference: d.transaction_ref,
      paid_at:           d.paid_at ? new Date(d.paid_at) : null,
      customer_email:    d.email ?? null,
      metadata:          d.meta ?? {},
    };
  }

  // ── Virtual Accounts (Individual) — UAT Scenario 1 + production ───────────

  async createVirtualAccount(
    params: CreateVirtualAccountParams
  ): Promise<SquadVirtualAccountDetails> {
    if (!this.isConfigured()) {
      throw new Error("Squad is not configured — SQUAD_SECRET_KEY missing");
    }

    const body: Record<string, unknown> = {
      customer_identifier: params.customer_identifier,
      first_name:          params.first_name,
      last_name:           params.last_name,
      mobile_num:          params.mobile_num,
      email:               params.email,
    };
    if (params.bvn)     body.bvn     = params.bvn;
    if (params.dob)     body.dob     = params.dob;
    if (params.address) body.address = params.address;
    if (params.gender)  body.gender  = params.gender;
    // Always include — squad-dva.service.ts already guards that this is non-empty.
    body.beneficiary_account = params.beneficiary_account ?? "";

    // WARN-level so this appears regardless of LOG_LEVEL setting.
    // Confirms what is about to be sent without logging sensitive values.
    logger.warn("squad_dva_payload_check", {
      base_url:                this.cfg.baseUrl,
      has_beneficiary_account: !!body.beneficiary_account,
      beneficiary_account_len: String(body.beneficiary_account ?? "").length,
      has_bvn:                 !!body.bvn,
      has_dob:                 !!body.dob,
      has_gender:              !!body.gender,
      has_address:             !!body.address,
      mobile_num_len:          String(body.mobile_num ?? "").length,
    });

    const res = await this.request<SquadVirtualAccountResponse>("POST", "/virtual-account", body);

    if (!res.success) {
      throw new Error(`Squad create virtual account failed: ${res.message}`);
    }

    const d = res.data;
    return {
      customer_identifier:    d.customer_identifier,
      virtual_account_number: d.virtual_account_number,
      account_name:           d.account_name ?? `${d.first_name} ${d.last_name}`,
      bank_name:              d.bank_name,
      bank_code:              d.bank_code,
    };
  }

  async fetchVirtualAccount(
    customerIdentifier: string
  ): Promise<SquadVirtualAccountDetails | null> {
    if (!this.isConfigured()) return null;

    try {
      const res = await this.request<SquadVirtualAccountResponse>(
        "GET",
        `/virtual-account/${encodeURIComponent(customerIdentifier)}`
      );

      if (!res.success || !res.data?.virtual_account_number) return null;

      const d = res.data;
      return {
        customer_identifier:    d.customer_identifier,
        virtual_account_number: d.virtual_account_number,
        account_name:           d.account_name ?? `${d.first_name} ${d.last_name}`,
        bank_name:              d.bank_name,
        bank_code:              d.bank_code,
      };
    } catch (err) {
      // 404 is expected when no account exists yet — anything else is worth logging.
      const msg = (err as Error).message ?? "";
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) {
        logger.warn("squad_dva_lookup_error", { customer_identifier: customerIdentifier, error: msg });
      }
      return null;
    }
  }

  // ── Virtual Accounts (Business) — UAT Scenario 2 ─────────────────────────

  async createBusinessVirtualAccount(
    params: CreateBusinessVirtualAccountParams
  ): Promise<SquadBusinessVirtualAccountDetails> {
    if (!this.isConfigured()) {
      throw new Error("Squad is not configured — secret key missing");
    }

    const body: Record<string, unknown> = {
      customer_identifier: params.customer_identifier,
      business_name:       params.business_name,
      mobile_num:          params.mobile_num,
      bvn:                 params.bvn,
    };
    if (params.bank_code)           body.bank_code           = params.bank_code;
    if (params.beneficiary_account) body.beneficiary_account = params.beneficiary_account;

    const res = await this.request<SquadBusinessVirtualAccountResponse>(
      "POST",
      "/virtual-account/business",
      body
    );

    if (!res.success) {
      throw new Error(`Squad create business virtual account failed: ${res.message}`);
    }

    const d = res.data;
    return {
      customer_identifier:    d.customer_identifier,
      business_name:          d.business_name,
      virtual_account_number: d.virtual_account_number,
      account_name:           (d.account_name as string | undefined) ?? d.business_name,
      bank_name:              d.bank_name,
      bank_code:              d.bank_code,
    };
  }

  // ── Simulate Bank Transfer — UAT Scenario 3 (sandbox only) ───────────────

  async simulateVirtualAccountPayment(
    params: SimulateVirtualAccountPaymentParams
  ): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) {
      throw new Error("Squad is not configured — secret key missing");
    }

    const body: Record<string, unknown> = {
      virtual_account_number: params.virtual_account_number,
      amount:                 params.amount,
    };
    if (params.payment_date) body.payment_date = params.payment_date;
    if (params.bank_code)    body.bank_code    = params.bank_code;

    const res = await this.request<SquadBaseResponse & { data: Record<string, unknown> }>(
      "POST",
      "/virtual-account/simulate/payment",
      body
    );

    return res as unknown as Record<string, unknown>;
  }

  // ── Customer Transactions — UAT Scenario 4 ───────────────────────────────

  async getCustomerVirtualAccountTransactions(
    customerIdentifier: string,
    options?: VirtualAccountTransactionQueryOptions
  ): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) {
      throw new Error("Squad is not configured — secret key missing");
    }

    const queryParams: Record<string, unknown> = {};
    if (options?.page)      queryParams.page      = options.page;
    if (options?.perPage)   queryParams.perPage   = options.perPage;
    if (options?.startDate) queryParams.startDate = options.startDate;
    if (options?.endDate)   queryParams.endDate   = options.endDate;

    const res = await this.request<SquadBaseResponse & { data: Record<string, unknown> }>(
      "GET",
      `/virtual-account/customer/transactions/${encodeURIComponent(customerIdentifier)}`,
      Object.keys(queryParams).length > 0 ? queryParams : undefined
    );

    return res as unknown as Record<string, unknown>;
  }

  // ── Merchant Transactions — UAT Scenario 5 ───────────────────────────────

  async getMerchantVirtualAccountTransactions(
    options?: MerchantTransactionQueryOptions
  ): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) {
      throw new Error("Squad is not configured — secret key missing");
    }

    const queryParams: Record<string, unknown> = {};
    if (options?.page)                   queryParams.page                   = options.page;
    if (options?.perPage)                queryParams.perPage                = options.perPage;
    if (options?.startDate)              queryParams.startDate              = options.startDate;
    if (options?.endDate)                queryParams.endDate                = options.endDate;
    if (options?.virtual_account_number) queryParams.virtual_account_number = options.virtual_account_number;

    const res = await this.request<SquadBaseResponse & { data: Record<string, unknown> }>(
      "GET",
      "/virtual-account/merchant/transactions",
      Object.keys(queryParams).length > 0 ? queryParams : undefined
    );

    return res as unknown as Record<string, unknown>;
  }

  // ── Retrieve VA by Account Number — UAT Scenario 6 ───────────────────────

  async fetchVirtualAccountByNumber(
    virtualAccountNumber: string
  ): Promise<SquadVirtualAccountDetails | null> {
    if (!this.isConfigured()) return null;

    try {
      const res = await this.request<SquadVirtualAccountResponse>(
        "GET",
        `/virtual-account/customer/${encodeURIComponent(virtualAccountNumber)}`
      );

      if (!res.success || !res.data?.virtual_account_number) return null;

      const d = res.data;
      return {
        customer_identifier:    d.customer_identifier,
        virtual_account_number: d.virtual_account_number,
        account_name:           d.account_name ?? `${d.first_name} ${d.last_name}`,
        bank_name:              d.bank_name,
        bank_code:              d.bank_code,
      };
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) {
        logger.warn("squad_va_number_lookup_error", { virtual_account_number: virtualAccountNumber, error: msg });
      }
      return null;
    }
  }

  // Squad signs webhook payloads with HMAC-SHA512 of the raw request body.
  // The signature is sent in the x-squad-encrypted-body header.
  // Uses webhookSecret if set, otherwise falls back to secretKey.
  validateWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.cfg.webhookSecret || this.cfg.secretKey;
    if (!secret) return false;

    const expected = createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    return timingSafeEqual(expected, signature);
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Exported instances ────────────────────────────────────────────────────────

// Production gateway — uses SQUAD_SECRET_KEY + SQUAD_BASE_URL
export const squadGateway = new SquadGateway();

// Sandbox gateway — uses SQUAD_SANDBOX_* env vars only.
// No fallback to production credentials; UAT controllers guard against missing config.
export const squadSandboxGateway = new SquadGateway({
  secretKey: config.squadSandbox.secretKey,
  baseUrl:   config.squadSandbox.baseUrl,
});
