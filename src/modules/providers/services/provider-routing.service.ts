import { getDbInstance } from "../../../db/knex";
import { providerRegistry } from "./provider-registry.service";
import type { ProviderServiceType } from "../types/provider.types";

const db = getDbInstance();

/**
 * Returns the highest-priority active provider that supports the given
 * service type.  Queries provider_configs (DB-driven) and resolves the
 * matching VTUProvider instance from the in-memory registry.
 *
 * Throws if no eligible provider exists — callers should let this
 * propagate so BullMQ retries the job.
 */
export async function getBestProvider(serviceType: ProviderServiceType) {
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
