import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export interface ProviderPlanMapping {
  id:                  string;
  plan_id:             string;
  provider_code:       string;
  provider_plan_code:  string;
  provider_cost_price: number | null;
  provider_operator:   string | null;
  provider_category:   string | null;
  priority:            number;
  enabled:             boolean;
  allow_loss_fallback: boolean;
  metadata:            Record<string, unknown>;
  created_at:          string;
  updated_at:          string;
}

export type CreateMappingInput = Omit<ProviderPlanMapping, "id" | "created_at" | "updated_at">;
export type UpdateMappingInput = Partial<Omit<ProviderPlanMapping, "id" | "plan_id" | "created_at" | "updated_at">>;

// ── Read ──────────────────────────────────────────────────────────────────────

/** All mappings for a plan, ordered by priority ASC. */
export async function getPlanMappings(planId: string): Promise<ProviderPlanMapping[]> {
  return db("provider_plan_mappings")
    .where({ plan_id: planId })
    .orderBy("priority", "asc")
    .orderBy("provider_code", "asc");
}

/**
 * Fetch the single mapping for a (plan, provider) pair.
 * Returns null when no mapping has been configured — callers treat this as
 * "backward-compatible: use plan defaults".
 */
export async function getPlanMappingForProvider(
  planId:       string,
  providerCode: string,
): Promise<ProviderPlanMapping | null> {
  return (
    (await db("provider_plan_mappings")
      .where({ plan_id: planId, provider_code: providerCode })
      .first()) ?? null
  );
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createPlanMapping(input: CreateMappingInput): Promise<ProviderPlanMapping> {
  const [row] = await db("provider_plan_mappings")
    .insert({
      ...input,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*");
  return row as ProviderPlanMapping;
}

export async function updatePlanMapping(
  id:    string,
  input: UpdateMappingInput,
): Promise<ProviderPlanMapping | null> {
  const [row] = await db("provider_plan_mappings")
    .where({ id })
    .update({ ...input, updated_at: new Date() })
    .returning("*");
  return (row as ProviderPlanMapping) ?? null;
}

export async function deletePlanMapping(id: string): Promise<boolean> {
  const deleted = await db("provider_plan_mappings").where({ id }).delete();
  return deleted > 0;
}
