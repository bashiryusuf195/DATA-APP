import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
} from "../types/provider.types";

export interface VTUProvider {
  name: string;

  purchase(
    input: ProviderPurchaseInput
  ): Promise<ProviderPurchaseResult>;
}