import { createHmac } from "crypto";
import { config } from "../../../config";
import type {
  PaymentGateway,
  InitializePaymentParams,
  InitializePaymentResult,
  TransferAccountDetails,
  VerifyPaymentResult,
  GatewayPaymentStatus,
} from "../types/payment-gateway.types";

const TIMEOUT_MS = 15_000;

// ── Internal response shapes ──────────────────────────────────────────────────

interface PaystackCustomerResponse {
  status:  boolean;
  message: string;
  data: {
    customer_code: string;
    email:         string;
    id:            number;
  };
}

interface PaystackFetchCustomerResponse {
  status:  boolean;
  message: string;
  data: {
    customer_code:    string;
    email:            string;
    id:               number;
    dedicated_account?: {
      account_number: string;
      account_name:   string;
      bank: { name: string; slug: string };
      active:         boolean;
    } | null;
  };
}

interface PaystackDVAResponse {
  status:  boolean;
  message: string;
  data: {
    account_number: string;
    account_name:   string;
    bank: {
      name: string;
      slug: string;
    };
    customer: {
      customer_code: string;
    };
    active: boolean;
  };
}

export interface DVADetails {
  account_number: string;
  account_name:   string;
  bank_name:      string;
  bank_slug:      string;
}

interface PaystackInitializeResponse {
  status:  boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code:       string;
    reference:         string;
  };
}

// Response from POST /charge with bank_transfer method.
// Paystack may return account details as flat fields or inside a nested object;
// we handle both layouts defensively.
interface PaystackChargeResponse {
  status:  boolean;
  message: string;
  data: {
    id:           number;
    reference:    string;
    status:       string;    // "pending"
    amount:       number;    // kobo
    currency:     string;
    channel:      string;    // "bank_transfer"
    next_action?: string;    // "display_details"
    display_text?: string;
    // Account details — present when next_action === "display_details":
    account_number?: string;
    account_name?:   string;
    // Paystack returns bank as either a plain string or a { name, code } object:
    bank?: string | { name: string; code?: string };
  };
}

interface PaystackVerifyResponse {
  status:  boolean;
  message: string;
  data: {
    status:           string; // "success" | "failed" | "abandoned" | "pending"
    reference:        string;
    amount:           number; // kobo
    currency:         string;
    channel:          string | null;
    id:               number; // Paystack numeric transaction id
    paid_at:          string | null;
    customer: {
      email: string;
    };
    metadata:         Record<string, unknown> | null;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return Boolean(config.paystack.secretKey);
}

function authHeader(): string {
  return `Bearer ${config.paystack.secretKey}`;
}

async function paystackFetch<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path:   string,
  body?:  Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const url = `${config.paystack.baseUrl}${path}`;

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

    const json = (await res.json()) as T;

    if (!res.ok) {
      const msg = (json as { message?: string }).message ?? `HTTP ${res.status}`;
      throw new Error(`Paystack ${method} ${path} failed: ${msg}`);
    }

    return json;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Paystack request timed out: ${method} ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── PaystackGateway ───────────────────────────────────────────────────────────

class PaystackGateway implements PaymentGateway {
  readonly name = "paystack";

  isConfigured(): boolean {
    return isConfigured();
  }

  async initializePayment(
    params: InitializePaymentParams
  ): Promise<InitializePaymentResult> {
    if (!isConfigured()) {
      throw new Error("Paystack is not configured — PAYSTACK_SECRET_KEY missing");
    }

    const res = await paystackFetch<PaystackInitializeResponse>("POST", "/transaction/initialize", {
      email:        params.email,
      amount:       params.amount_kobo,
      reference:    params.reference,
      callback_url: params.callback_url ?? (config.paystack.callbackUrl || undefined),
      metadata:     params.metadata,
    });

    if (!res.status) {
      throw new Error(`Paystack initialization failed: ${res.message}`);
    }

    return {
      authorization_url: res.data.authorization_url,
      access_code:       res.data.access_code,
      reference:         res.data.reference,
    };
  }

  // Initiate a one-time bank transfer charge via POST /charge.
  // Returns transfer account details so the frontend can display them in-app
  // without redirecting to the Paystack checkout page.
  // The standard charge.success webhook fires on payment and the existing
  // webhook worker credits the wallet — no separate handling needed.
  async initiateBankTransfer(params: {
    email:       string;
    amount_kobo: number;
    reference:   string;
    metadata?:   Record<string, unknown>;
  }): Promise<TransferAccountDetails & { reference: string }> {
    if (!isConfigured()) {
      throw new Error("Paystack is not configured — PAYSTACK_SECRET_KEY missing");
    }

    const res = await paystackFetch<PaystackChargeResponse>("POST", "/charge", {
      email:     params.email,
      amount:    params.amount_kobo,
      reference: params.reference,
      metadata:  params.metadata,
      bank_transfer: {},
    });

    if (!res.status) {
      throw new Error(`Paystack bank transfer charge failed: ${res.message}`);
    }

    const d = res.data;

    // Normalise the bank field — Paystack returns it as either a string or object.
    const bankName = typeof d.bank === "string"
      ? d.bank
      : (d.bank as { name?: string } | undefined)?.name ?? "Unknown Bank";

    return {
      reference:      d.reference ?? params.reference,
      account_number: d.account_number ?? "",
      account_name:   d.account_name   ?? "PAYSTACK",
      bank_name:      bankName,
      display_text:   d.display_text   ?? `Transfer to ${d.account_number ?? ""} — ${bankName}`,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    if (!isConfigured()) {
      throw new Error("Paystack is not configured — PAYSTACK_SECRET_KEY missing");
    }

    const res = await paystackFetch<PaystackVerifyResponse>(
      "GET",
      `/transaction/verify/${encodeURIComponent(reference)}`
    );

    if (!res.status) {
      throw new Error(`Paystack verify failed: ${res.message}`);
    }

    const d = res.data;

    const statusMap: Record<string, GatewayPaymentStatus> = {
      success:   "success",
      failed:    "failed",
      abandoned: "abandoned",
      pending:   "pending",
    };

    return {
      status:            statusMap[d.status] ?? "failed",
      amount_kobo:       d.amount,
      currency:          d.currency,
      channel:           d.channel ?? null,
      gateway_reference: String(d.id),
      paid_at:           d.paid_at ? new Date(d.paid_at) : null,
      customer_email:    d.customer?.email ?? null,
      metadata:          d.metadata ?? {},
    };
  }

  // ── Dedicated Virtual Accounts ────────────────────────────────────────────

  async createOrFetchCustomer(params: {
    email:      string;
    first_name: string;
    last_name:  string;
    phone:      string;
  }): Promise<{ customer_code: string }> {
    if (!isConfigured()) {
      throw new Error("Paystack is not configured — PAYSTACK_SECRET_KEY missing");
    }

    const profileFields = {
      first_name: params.first_name,
      last_name:  params.last_name,
      phone:      params.phone,
    };

    // Try fetching by email first to avoid duplicate customer errors.
    // When customer already exists, always update with the latest profile data so
    // that accounts created before first_name/last_name/phone were set get backfilled.
    try {
      const fetchRes = await paystackFetch<PaystackFetchCustomerResponse>(
        "GET",
        `/customer/${encodeURIComponent(params.email)}`
      );
      if (fetchRes.status && fetchRes.data?.customer_code) {
        const code = fetchRes.data.customer_code;
        await paystackFetch<PaystackCustomerResponse>("PUT", `/customer/${encodeURIComponent(code)}`, profileFields);
        return { customer_code: code };
      }
    } catch {
      // Customer doesn't exist yet — fall through to create
    }

    const res = await paystackFetch<PaystackCustomerResponse>("POST", "/customer", {
      email: params.email,
      ...profileFields,
    });

    if (!res.status) {
      throw new Error(`Paystack create customer failed: ${res.message}`);
    }

    return { customer_code: res.data.customer_code };
  }

  async createDedicatedAccount(
    customerCode: string,
    preferredBank = "wema-bank"
  ): Promise<DVADetails> {
    if (!isConfigured()) {
      throw new Error("Paystack is not configured — PAYSTACK_SECRET_KEY missing");
    }

    const res = await paystackFetch<PaystackDVAResponse>("POST", "/dedicated_account", {
      customer:       customerCode,
      preferred_bank: preferredBank,
      country:        "NG",
    });

    if (!res.status) {
      throw new Error(`Paystack create dedicated account failed: ${res.message}`);
    }

    return {
      account_number: res.data.account_number,
      account_name:   res.data.account_name,
      bank_name:      res.data.bank.name,
      bank_slug:      res.data.bank.slug,
    };
  }

  async fetchDedicatedAccounts(customerCode: string): Promise<DVADetails[]> {
    if (!isConfigured()) return [];

    try {
      const res = await paystackFetch<PaystackFetchCustomerResponse>(
        "GET",
        `/customer/${encodeURIComponent(customerCode)}`
      );

      if (res.status && res.data?.dedicated_account) {
        const dva = res.data.dedicated_account;
        return [{
          account_number: dva.account_number,
          account_name:   dva.account_name,
          bank_name:      dva.bank.name,
          bank_slug:      dva.bank.slug,
        }];
      }
      return [];
    } catch {
      return [];
    }
  }

  // Paystack signs webhook payloads with HMAC-SHA512 of the raw request body.
  // The signature is sent in the x-paystack-signature header.
  // Uses webhookSecret if set, otherwise falls back to secretKey (same secret).
  validateWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = (config.paystack.webhookSecret || config.paystack.secretKey);
    if (!secret) return false;

    const expected = createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
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

export const paystackGateway = new PaystackGateway();
