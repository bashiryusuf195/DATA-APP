import type { VTUProvider } from "./provider.interface";

import { MockVTUProvider } from "./mock-vtu.provider";
import { VTPassProvider } from "./vtpass.provider";
import { config } from "../../../config";

class ProviderRegistryService {
  private providers: Map<string, VTUProvider>;

  constructor() {
    this.providers = new Map();

    // Mock provider is always registered as the guaranteed fallback.
    this.register(new MockVTUProvider());

    // Register VTPass if all required env vars are present.
    const vtpass = new VTPassProvider();
    const missing = vtpass.missingCredentials();
    if (missing.length === 0) {
      this.register(vtpass);
      console.log(
        "[PROVIDER REGISTRY] VTPass registered —",
        config.vtpass.baseUrl
      );
    } else {
      console.warn(
        "[PROVIDER REGISTRY] VTPass not configured — missing:",
        missing.join(", "),
        "— mock provider will be used as fallback."
      );
    }
  }

  register(provider: VTUProvider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): VTUProvider {
    const provider = this.providers.get(name);

    if (!provider) {
      throw new Error(`Provider '${name}' not found`);
    }

    return provider;
  }

  getDefaultProvider(): VTUProvider {
    return this.getProvider("mock_vtu_provider");
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry =
  new ProviderRegistryService();
