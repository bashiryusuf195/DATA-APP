// Provider-agnostic payment gateway interface.
// Paystack is the initial implementation; Flutterwave / Monnify can be added
// by creating a new class that implements PaymentGateway.

// Returned when a gateway supports in-app bank transfer (no checkout redirect).
export interface TransferAccountDetails {
  account_number: string;
  account_name:   string;
  bank_name:      string;
  display_text:   string;   // full human-readable instruction from the provider
  expires_at?:    string;   // ISO timestamp — set if the account is temporary
}

export interface InitializePaymentParams {
  email:        string;
  amount_kobo:  number;   // always in smallest unit (kobo for NGN)
  reference:    string;
  callback_url?: string;
  metadata?:    Record<string, unknown>;
}

export interface InitializePaymentResult {
  authorization_url: string;
  access_code:       string;
  reference:         string;
}

export type GatewayPaymentStatus = "success" | "failed" | "abandoned" | "pending";

export interface VerifyPaymentResult {
  status:             GatewayPaymentStatus;
  amount_kobo:        number;
  currency:           string;
  channel:            string | null;
  gateway_reference:  string | null;
  paid_at:            Date | null;
  customer_email:     string | null;
  metadata:           Record<string, unknown>;
}

export interface PaymentGateway {
  readonly name: string;

  initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  validateWebhookSignature(rawBody: Buffer, signature: string): boolean;
}
