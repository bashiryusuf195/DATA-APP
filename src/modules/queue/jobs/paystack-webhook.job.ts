export interface PaystackWebhookJobPayload {
  webhook_event_id:  string;
  reference:         string;
  event:             string;
  channel?:          string | null;  // "dedicated_nuban" for DVA bank transfers
  customer_code?:    string | null;  // Paystack customer_code for DVA lookups
  amount_kobo?:      number | null;  // pre-extracted from webhook for DVA path
  paid_at?:          string | null;
}
