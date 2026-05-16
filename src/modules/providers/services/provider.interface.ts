import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
} from "../types/provider.types";

export interface VTUProvider {
  name: string;

  purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult>;

  verifyTransaction(reference: string): Promise<VerifyTransactionResult>;

  getBalance(): Promise<ProviderBalance>;

  healthCheck(): Promise<ProviderHealthResult>;
}
