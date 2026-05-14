import type { VTUProvider } from "./provider.interface";

import { MockVTUProvider } from "./mock-vtu.provider";

class ProviderRegistryService {
  private providers: Map<string, VTUProvider>;

  constructor() {
    this.providers = new Map();

    this.register(new MockVTUProvider());
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