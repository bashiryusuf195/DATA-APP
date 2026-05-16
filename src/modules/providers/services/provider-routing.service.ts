import { getDbInstance } from "../../../db/knex";
import { providerRegistry } from "./provider-registry.service";
import type { VTUProvider } from "./provider.interface";
import type { ProviderServiceType } from "../types/provider.types";
import { getActiveRoutingRule } from "./provider-routing-rules.service";

const db = getDbInstance();

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryGetProvider(providerCode: string): VTUProvider | null {
  try {
    return providerRegistry.getProvider(providerCode);
  } catch {
    return null; // not registered
  }
}

async function isProviderActive(providerCode: string): Promise<boolean> {
  const config = await db("provider_configs")
    .where({ provider_code: providerCode, is_active: true })
    .first();
  return !!config;
}

// ── Main routing function ─────────────────────────────────────────────────────

/**
 * Returns the best VTUProvider for the given service type.
 *
 * Resolution order:
 *  1. Active routing rule for the service type:
 *     a. primary_provider_code if registered and is_active in provider_configs
 *     b. fallback_provider_code (same checks) when primary is unavailable
 *  2. Priority-based selection from provider_configs (lowest priority number wins)
 *
 * Throws if no eligible provider is available, which lets BullMQ retry the job.
 */
export async function getBestProvider(
  serviceType: ProviderServiceType
): Promise<VTUProvider> {
  // ── 1. Routing-rule path ───────────────────────────────────────────────────
  // Fail-open: if the table doesn't exist yet (e.g. pending migration) skip
  // routing-rule lookup and fall through to priority-based selection.
  let rule = null;
  try {
    rule = await getActiveRoutingRule(serviceType);
  } catch (err) {
    console.warn(
      `[ROUTING] routing-rule lookup failed for ${serviceType}, falling back to priority-based selection:`,
      (err as Error).message
    );
  }

  if (rule) {
    // Try primary
    const primary = tryGetProvider(rule.primary_provider_code);
    if (primary && (await isProviderActive(rule.primary_provider_code))) {
      console.log(
        `[ROUTING] rule → primary '${rule.primary_provider_code}' for ${serviceType}`
      );
      return primary;
    }

    // Primary unavailable — try fallback
    if (rule.fallback_provider_code) {
      const fallback = tryGetProvider(rule.fallback_provider_code);
      if (fallback && (await isProviderActive(rule.fallback_provider_code))) {
        console.warn(
          `[ROUTING] primary '${rule.primary_provider_code}' unavailable for ${serviceType},` +
          ` using fallback '${rule.fallback_provider_code}'`
        );
        return fallback;
      }
    }

    // Both unavailable — fall through to priority-based
    console.warn(
      `[ROUTING] routing rule providers unavailable for ${serviceType}, ` +
      `falling through to priority-based selection`
    );
  }

  // ── 2. Priority-based path ─────────────────────────────────────────────────
  const config = await db("provider_configs")
    .where({ is_active: true })
    .whereRaw("supported_services @> ?::jsonb", [JSON.stringify([serviceType])])
    .orderBy("priority", "asc")
    .first();

  if (!config) {
    throw new Error(
      `No active provider available for service type: ${serviceType}`
    );
  }

  return providerRegistry.getProvider(config.provider_code as string);
}
