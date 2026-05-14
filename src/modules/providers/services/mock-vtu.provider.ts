import { randomUUID } from "crypto";

import type { VTUProvider } from "./provider.interface";

import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
} from "../types/provider.types";

export class MockVTUProvider implements VTUProvider {
  name = "mock_vtu_provider";

  async purchase(
    input: ProviderPurchaseInput
  ): Promise<ProviderPurchaseResult> {
    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );

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
}