import type { VTUProvider } from "./provider.interface";
import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
} from "../types/provider.types";
import { getProviderCredentials } from "./provider-credentials.service";

/**
 * Base class for real HTTP-based VTU providers (VTPass, Clubkonnect, Reloadly, …).
 *
 * Subclass this and override purchase / verifyTransaction / getBalance with the
 * provider's actual HTTP API calls.  Until real credentials are wired in, every
 * method throws a clear "credentials not configured" error so callers get an
 * actionable message instead of a cryptic network failure.
 *
 * Pattern for a real integration:
 *
 *   export class VTPassProvider extends HttpVTUProvider {
 *     name = "vtpass";
 *     async purchase(input) {
 *       const creds = await this.requireCredentials();
 *       // call VTPass API using creds.api_key_encrypted, etc.
 *     }
 *   }
 */
export class HttpVTUProvider implements VTUProvider {
  constructor(public readonly name: string) {}

  // Validates that credentials exist in the DB before making any API call.
  // Throws if not configured — lets BullMQ surface the error and retry.
  protected async requireCredentials() {
    const creds = await getProviderCredentials(this.name);
    if (!creds) {
      throw new Error(`Provider credentials not configured for: ${this.name}`);
    }
    return creds;
  }

  async purchase(_input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    throw new Error(`Provider credentials not configured for: ${this.name}`);
  }

  async verifyTransaction(_reference: string): Promise<VerifyTransactionResult> {
    throw new Error(`Provider credentials not configured for: ${this.name}`);
  }

  async getBalance(): Promise<ProviderBalance> {
    throw new Error(`Provider credentials not configured for: ${this.name}`);
  }

  // healthCheck does not throw — it returns a safe degraded result so the
  // admin health-check endpoint can always respond without a 500.
  async healthCheck(): Promise<ProviderHealthResult> {
    return {
      healthy: false,
      message: `Provider credentials not configured for: ${this.name}`,
    };
  }
}
