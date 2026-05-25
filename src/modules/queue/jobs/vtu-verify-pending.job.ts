import type { ProviderServiceType } from "../../providers/types/provider.types";

export interface VtuVerifyPendingJobPayload {
  reference:              string;
  provider_code:          string;
  /** OrderID / provider_reference from the initial purchase response. */
  provider_reference:     string;
  user_id:                string;
  service_type:           ProviderServiceType;
  amount:                 number;
  source_wallet_id:       string | null;
  destination_wallet_id:  string | null;
  currency:               string;
  /** How many verification attempts have been made so far (0-indexed). */
  attempt_count:          number;
}
