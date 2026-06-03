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

    const json = (await res.json()) as T;

    if (!res.ok) {
      const msg = (json as { message?: string }).message ?? `HTTP ${res.status}`;
      throw new Error(`Squad ${method} ${path} failed: ${msg}`);
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
