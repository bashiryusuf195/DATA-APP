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

  // Plan category forwarded from service_plans.plan_category.
  // Used by electricity providers (e.g. SMShika) to distinguish prepaid/postpaid.
  plan_category?: string | null;

  // Network operator / biller forwarded from service_plans.network_operator.
  // Used by cable TV providers (e.g. SMShika) as the provider_code (dstv/gotv/startimes).
  network_operator?: string | null;

  customer_name?: string;

  reference: string;

  metadata?: Record<string, unknown>;
}

export interface ProviderPurchaseResult {
  success: boolean;

  provider_reference: string;

  provider: string;

  message: string;

  /** "processing" means the provider accepted the order but delivery is not yet confirmed. */
  status: "successful" | "processing" | "failed";

  raw_response?: unknown;

  /**
   * Unmasked data for PDF report generation — populated only by identity
   * verification providers. This field is NEVER persisted to DB directly;
   * the execution engine stores it under metadata.report_data and the photo
   * is never written to raw_response or logs.
   */
  report_data?: {
    id_type?:       "nin" | "bvn";
    id_number?:     string;       // unmasked NIN or BVN
    first_name?:    string;
    last_name?:     string;
    middle_name?:   string;
    date_of_birth?: string;
    gender?:        string;
    address?:       string;
    phone?:         string;       // unmasked
    photo?:         string;       // base64 image (excluded from DB raw_response)
  };
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

export interface MeterVerifyInput {
  meter_number: string;
  disco_name: string;
  meter_type: string;
}

export interface MeterVerifyResult {
  success: boolean;
  customer_name: string;
  address?: string;
  meter_number: string;
  message: string;
  raw_response?: unknown;
}

export interface CableVerifyInput {
  smartcard_number: string;
  biller_code: string;
}

export interface CableVerifyResult {
  success: boolean;
  customer_name?: string;
  current_package?: string;
  due_date?: string;
  smartcard_number?: string;
  message: string;
  raw_response?: unknown;
}