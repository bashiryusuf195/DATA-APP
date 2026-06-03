export interface SquadWebhookJobPayload {
  webhook_event_id: string;
  reference:        string;   // For charge_successful: our app ref; for VA credit: Squad's transaction_ref
  event:            string;   // "charge_successful" | "charge_failed" | "virtual-account.credit"
  channel?:         string | null;
  squad_ref?:       string | null;   // Squad's internal transaction reference (SQ_...)
  amount_kobo?:     number | null;   // Used for checkout payments
  paid_at?:         string | null;
  // Virtual account credit fields
  customer_identifier?:    string | null;  // Matches squad_virtual_accounts.customer_identifier
  amount_ngn?:             number | null;  // VA credit amounts arrive in NGN (not kobo)
  virtual_account_number?: string | null;
  sender_name?:            string | null;
}
