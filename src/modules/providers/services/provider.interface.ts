import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
  MeterVerifyInput,
  MeterVerifyResult,
  CableVerifyInput,
  CableVerifyResult,
} from "../types/provider.types";

export interface VTUProvider {
  name: string;

  purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult>;

  /** Optional: query the provider for the final status of a previously submitted order.
   *  If not implemented, the verification worker marks the transaction as requires_review
   *  after exhausting polling attempts. */
  verifyTransaction?(reference: string): Promise<VerifyTransactionResult>;

  getBalance(): Promise<ProviderBalance>;

  healthCheck(): Promise<ProviderHealthResult>;

  verifyMeter?(input: MeterVerifyInput): Promise<MeterVerifyResult>;

  verifyCable?(input: CableVerifyInput): Promise<CableVerifyResult>;
}
