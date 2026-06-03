export interface SquadWebhookJobPayload {
  webhook_event_id: string;
  reference:        string;   // Our app reference (TransactionRef from webhook)
  event:            string;   // "charge_successful" | "charge_failed"
  channel?:         string | null;
  squad_ref?:       string | null;   // Squad's internal transaction reference (SQ_...)
  amount_kobo?:     number | null;
  paid_at?:         string | null;
}
