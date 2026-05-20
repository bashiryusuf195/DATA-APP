export type ProviderServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable_tv"
  | "exam_pin"
  | "identity_verification"
  | "wallet_funding";

export interface ProviderPurchaseInput {
  service_type: ProviderServiceType;

  amount: number;

  phone?: string;

  smartcard_number?: string;

  meter_number?: string;

  variation_code?: string;

  // Provider-specific plan identifier resolved from service_plans.provider_variation_code.
  // Required by providers (e.g. SMShika data) that use a numeric plan ID rather than
  // the internal variation_code.
  provider_variation_code?: string | null;

  customer_name?: string;

  reference: string;

  metadata?: Record<string, unknown>;
}

export interface ProviderPurchaseResult {
  success: boolean;

  provider_reference: string;

  provider: string;

  message: string;

  status: "successful" | "pending" | "failed";

  raw_response?: unknown;
}

export interface VerifyTransactionResult {
  found: boolean;
  status: "successful" | "pending" | "failed";
  provider_reference?: string;
  message: string;
  raw_response?: unknown;
}

export interface ProviderBalance {
  available: number;
  currency: string;
  raw_response?: unknown;
}

export interface ProviderHealthResult {
  healthy: boolean;
  latency_ms?: number;
  message: string;
}