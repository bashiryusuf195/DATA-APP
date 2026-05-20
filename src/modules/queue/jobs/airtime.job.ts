export interface AirtimeJobPayload {
  user_id: string;

  phone: string;

  amount: number;

  reference: string;

  /** Network operator variation code, e.g. "mtn-airtime". Used by providers to resolve operator. */
  variation_code?: string;
}