import type { ProviderServiceType } from "../../providers/types/provider.types";

export interface VtuPurchaseJobPayload {
  user_id: string;
  reference: string;
  service_type: ProviderServiceType;
  amount: number;
  phone?: string;
  smartcard_number?: string;
  meter_number?: string;
  variation_code?: string;
  customer_name?: string;
  /** NIN or BVN number — forwarded to provider for identity_verification jobs. */
  id_number?: string;
}
