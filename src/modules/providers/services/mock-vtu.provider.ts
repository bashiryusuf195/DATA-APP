import { randomUUID } from "crypto";

import type { VTUProvider } from "./provider.interface";

import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
} from "../types/provider.types";

export class MockVTUProvider implements VTUProvider {
  name = "mock_vtu_provider";

  async purchase(
    input: ProviderPurchaseInput
  ): Promise<ProviderPurchaseResult> {
    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );if (input.phone === "08000000000") {
  return {
    success: false,
    provider_reference: randomUUID(),
    provider: this.name,
    message: "Mock provider failure",
    status: "failed",
    raw_response: {
      mock: true,
      forced_failure: true,
      input,
    },
  };
}

    return {
      success: true,
      provider_reference: randomUUID(),
      provider: this.name,
      message: `${input.service_type} purchase successful`,
      status: "successful",
      raw_response: {
        mock: true,
        input,
      },
    };
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    return {
      found: true,
      status: "successful",
      provider_reference: randomUUID(),
      message: "Mock transaction verified successfully",
      raw_response: { mock: true, reference },
    };
  }

  async getBalance(): Promise<ProviderBalance> {
    return {
      available: 999999.99,
      currency: "NGN",
      raw_response: { mock: true },
    };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    return {
      healthy: true,
      latency_ms: 0,
      message: "Mock provider is always healthy",
    };
  }
}
