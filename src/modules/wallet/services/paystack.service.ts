import { createHmac } from "crypto";
import { config } from "../../../config";
import type {
  PaymentGateway,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
  GatewayPaymentStatus,
} from "../types/payment-gateway.types";

const TIMEOUT_MS = 15_000;

// ── Internal response shapes ──────────────────────────────────────────────────

interface PaystackInitializeResponse {
  status:  boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code:       string;
    reference:         string;
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
  method: "GET" | "POST",
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
