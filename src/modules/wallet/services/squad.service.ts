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

// ── Internal response shapes ──────────────────────────────────────────────────

interface SquadVirtualAccountResponse {
  status:  number;
  success: boolean;
  message: string;
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

export interface SquadVirtualAccountDetails {
  customer_identifier:    string;
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

interface SquadInitializeResponse {
  status:  number;
  success: boolean;
  message: string;
  data: {
    checkout_url:    string;
    transaction_ref: string;  // Squad's own internal ref (SQ_...)
    amount:          number;
    currency:        string;
    merchant_info?:  Record<string, unknown>;
  };
}

interface SquadVerifyResponse {
  status:  number;
  success: boolean;
  message: string;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return Boolean(config.squad.secretKey);
}

function authHeader(): string {
  return `Bearer ${config.squad.secretKey}`;
}

async function squadFetch<T>(
  method: "GET" | "POST",
  path:   string,
  body?:  Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const url = `${config.squad.baseUrl}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": authHeader(),
        "Content-Type":  "application/json",
      },
      body:   body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
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

// ── SquadGateway ──────────────────────────────────────────────────────────────

class SquadGateway implements PaymentGateway {
  readonly name = "squad";

  isConfigured(): boolean {
    return isConfigured();
  }

  async initializePayment(
    params: InitializePaymentParams
  ): Promise<InitializePaymentResult> {
    if (!isConfigured()) {
      throw new Error("Squad is not configured — SQUAD_SECRET_KEY missing");
    }

    const res = await squadFetch<SquadInitializeResponse>("POST", "/transaction/initiate", {
      email:           params.email,
      amount:          params.amount_kobo,
      currency:        "NGN",
      initiate_type:   "inline",
      transaction_ref: params.reference,
      callback_url:    params.callback_url ?? (config.squad.callbackUrl || undefined),
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
    if (!isConfigured()) {
      throw new Error("Squad is not configured — SQUAD_SECRET_KEY missing");
    }

    const res = await squadFetch<SquadVerifyResponse>(
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

  // ── Virtual Accounts (Reserved Accounts) ─────────────────────────────────

  async createVirtualAccount(
    params: CreateVirtualAccountParams
  ): Promise<SquadVirtualAccountDetails> {
    if (!isConfigured()) {
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
      base_url:               config.squad.baseUrl,
      has_beneficiary_account: !!body.beneficiary_account,
      beneficiary_account_len: String(body.beneficiary_account ?? "").length,
      has_bvn:                 !!body.bvn,
      has_dob:                 !!body.dob,
      has_gender:              !!body.gender,
      has_address:             !!body.address,
      mobile_num_len:          String(body.mobile_num ?? "").length,
    });

    const res = await squadFetch<SquadVirtualAccountResponse>("POST", "/virtual-account", body);

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
    if (!isConfigured()) return null;

    try {
      const res = await squadFetch<SquadVirtualAccountResponse>(
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

  // Squad signs webhook payloads with HMAC-SHA512 of the raw request body.
  // The signature is sent in the x-squad-encrypted-body header.
  // Uses webhookSecret if set, otherwise falls back to secretKey.
  validateWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = config.squad.webhookSecret || config.squad.secretKey;
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

export const squadGateway = new SquadGateway();
