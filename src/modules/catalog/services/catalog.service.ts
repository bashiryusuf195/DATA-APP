import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export async function getActiveServices() {
  return db("catalog_services")
    .where({ is_active: true })
    .orderBy("service_type", "asc")
    .orderBy("name", "asc")
    .select("id", "slug", "name", "service_type");
}

export async function getActivePlansForType(
  serviceType: string,
  provider?: string
) {
  return db("service_plans")
    .join("catalog_services", "service_plans.service_id", "catalog_services.id")
    .where("catalog_services.service_type", serviceType)
    .where("service_plans.is_active", true)
    .where("catalog_services.is_active", true)
    // Block plans whose network/operator is disabled
    .whereNotExists(
      db("service_availability_controls")
        .select(db.raw("1"))
        .where("service_availability_controls.is_active", false)
        .whereNull("service_availability_controls.plan_category")
        .whereRaw("service_availability_controls.service_type = catalog_services.service_type")
        .whereRaw("service_availability_controls.network_operator = service_plans.network_operator")
    )
    // Block plans whose network+category combo is disabled
    .whereNotExists(
      db("service_availability_controls")
        .select(db.raw("1"))
        .where("service_availability_controls.is_active", false)
        .whereNotNull("service_availability_controls.plan_category")
        .whereRaw("service_availability_controls.service_type = catalog_services.service_type")
        .whereRaw("service_availability_controls.network_operator = service_plans.network_operator")
        .whereRaw("service_availability_controls.plan_category = service_plans.plan_category")
    )
    .modify((q) => {
      if (provider) {
        const term = `%${provider}%`;
        q.where(function () {
          this.whereRaw("catalog_services.name ILIKE ?", [term]).orWhereRaw(
            "catalog_services.slug ILIKE ?",
            [term]
          );
        });
      }
    })
    .orderBy("service_plans.amount", "asc")
    .select(
      "service_plans.id",
      "service_plans.variation_code",
      "service_plans.name",
      "service_plans.amount",
      "service_plans.selling_price",
      "service_plans.is_variable_amount",
      "service_plans.provider_code",
      "service_plans.metadata",
      "service_plans.network_operator",
      "service_plans.plan_category",
      "catalog_services.slug as service_slug",
      "catalog_services.name as service_name"
    );
}

// ── Admin read operations ─────────────────────────────────────────────────────

export async function adminListServices(filters: {
  service_type?: string;
  is_active?: boolean;
}) {
  return db("catalog_services")
    .modify((q) => {
      if (filters.service_type) q.where("service_type", filters.service_type);
      if (filters.is_active !== undefined) q.where("is_active", filters.is_active);
    })
    .orderBy("service_type", "asc")
    .orderBy("name", "asc")
    .select<{ id: string; slug: string; name: string; service_type: string; is_active: boolean; created_at: string; updated_at: string }[]>("*");
}

export interface AdminListServicePlansFilters {
  service_id?:            string;
  service_type?:          string;
  provider_code?:         string;
  network_operator?:      string;
  plan_category?:         string;
  search?:                string;
  is_active?:             boolean;
  has_provider_override?: boolean;
  limit?:                 number;
  offset?:                number;
}

export interface ServicePlanRow {
  id: string; service_id: string; provider_code: string; name: string;
  variation_code: string; amount: string; cost_price: string | null;
  selling_price: string | null; is_variable_amount: boolean;
  metadata: Record<string, unknown>; is_active: boolean;
  network_operator: string | null; plan_category: string | null;
  duration_days: number | null;
  created_at: string; updated_at: string;
  service_slug: string; service_name: string; service_type: string;
  primary_provider_code: string | null; fallback_provider_code: string | null;
  provider_variation_code: string | null; provider_metadata: Record<string, unknown>;
}

function applyPlanFilters(
  q: ReturnType<typeof db>,
  filters: AdminListServicePlansFilters,
) {
  if (filters.service_id)       q.where("sp.service_id", filters.service_id);
  if (filters.service_type)     q.where("cs.service_type", filters.service_type);
  if (filters.provider_code)    q.where("sp.provider_code", filters.provider_code);
  if (filters.network_operator) q.where("sp.network_operator", filters.network_operator);
  if (filters.plan_category)    q.where("sp.plan_category", filters.plan_category);
  if (filters.is_active !== undefined) q.where("sp.is_active", filters.is_active);
  if (filters.has_provider_override === true)  q.whereNotNull("sp.primary_provider_code");
  if (filters.has_provider_override === false) q.whereNull("sp.primary_provider_code");
  if (filters.search) {
    const term = `%${filters.search}%`;
    q.where(function (this: typeof q) {
      this.whereRaw("sp.name ILIKE ?", [term])
        .orWhereRaw("sp.variation_code ILIKE ?", [term])
        .orWhereRaw("sp.network_operator ILIKE ?", [term]);
    });
  }
}

export async function adminListServicePlans(filters: AdminListServicePlansFilters): Promise<{
  plans: ServicePlanRow[];
  total: number;
}> {
  const limit  = filters.limit  ?? 50;
  const offset = filters.offset ?? 0;

  const baseQuery = () =>
    db("service_plans as sp").join("catalog_services as cs", "cs.id", "sp.service_id");

  const [countResult, rows] = await Promise.all([
    baseQuery()
      .modify((q) => applyPlanFilters(q, filters))
      .count<{ count: string }[]>("sp.id as count")
      .then((r) => parseInt((r[0] as unknown as { count: string }).count, 10)),

    baseQuery()
      .modify((q) => applyPlanFilters(q, filters))
      .orderBy("cs.service_type", "asc")
      .orderBy("sp.network_operator", "asc")
      .orderBy("sp.amount", "asc")
      .limit(limit)
      .offset(offset)
      .select<ServicePlanRow[]>(
        "sp.id", "sp.service_id", "sp.provider_code", "sp.name",
        "sp.variation_code", "sp.amount", "sp.cost_price", "sp.selling_price",
        "sp.is_variable_amount", "sp.metadata", "sp.is_active",
        "sp.network_operator", "sp.plan_category", "sp.duration_days",
        "sp.created_at", "sp.updated_at",
        "sp.primary_provider_code", "sp.fallback_provider_code",
        "sp.provider_variation_code", "sp.provider_metadata",
        db.raw("cs.slug AS service_slug"),
        db.raw("cs.name AS service_name"),
        db.raw("cs.service_type AS service_type"),
      ),
  ]);

  return { plans: rows, total: countResult };
}

export async function bulkToggleServicePlans(
  filters: Pick<AdminListServicePlansFilters, "service_id" | "service_type" | "network_operator" | "plan_category">,
  is_active: boolean,
): Promise<number> {
  const q = db("service_plans as sp")
    .join("catalog_services as cs", "cs.id", "sp.service_id");

  if (filters.service_id)       q.where("sp.service_id", filters.service_id);
  if (filters.service_type)     q.where("cs.service_type", filters.service_type);
  if (filters.network_operator) q.where("sp.network_operator", filters.network_operator);
  if (filters.plan_category)    q.where("sp.plan_category", filters.plan_category);

  // Extract matching IDs then update — join on UPDATE not portable across all Knex targets
  const ids = await q.pluck("sp.id");

  if (ids.length === 0) return 0;

  await db("service_plans")
    .whereIn("id", ids)
    .update({ is_active, updated_at: new Date() });

  return ids.length;
}

// ── Admin write operations ────────────────────────────────────────────────────

export async function createCatalogService(data: {
  slug: string;
  name: string;
  service_type: string;
  is_active: boolean;
}) {
  const [row] = await db("catalog_services")
    .insert({ id: randomUUID(), ...data })
    .returning("*");
  return row;
}

export async function updateCatalogService(
  id: string,
  data: Partial<{
    slug: string;
    name: string;
    service_type: string;
    is_active: boolean;
  }>
) {
  const rows = await db("catalog_services")
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning("*");
  return rows[0] ?? null;
}

export async function createServicePlan(data: {
  service_id: string;
  provider_code: string;
  name: string;
  variation_code: string;
  amount: number;
  cost_price?: number | null;
  selling_price?: number | null;
  is_variable_amount: boolean;
  metadata: Record<string, unknown>;
  is_active: boolean;
  primary_provider_code?: string | null;
  fallback_provider_code?: string | null;
  provider_variation_code?: string | null;
  provider_metadata?: Record<string, unknown>;
}) {
  const [row] = await db("service_plans")
    .insert({ id: randomUUID(), ...data })
    .returning("*");
  return row;
}

export async function updateServicePlan(
  id: string,
  data: Partial<{
    service_id: string;
    provider_code: string;
    name: string;
    variation_code: string;
    amount: number;
    cost_price: number | null;
    selling_price: number | null;
    is_variable_amount: boolean;
    metadata: Record<string, unknown>;
    is_active: boolean;
    primary_provider_code: string | null;
    fallback_provider_code: string | null;
    provider_variation_code: string | null;
    provider_metadata: Record<string, unknown>;
  }>
) {
  const rows = await db("service_plans")
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning("*");
  return rows[0] ?? null;
}

export interface BulkImportPlanInput {
  name:                    string;
  variation_code:          string;
  amount:                  number;
  cost_price?:             number | null;
  selling_price?:          number | null;
  network_operator?:       string | null;
  plan_category?:          string | null;
  duration_days?:          number | null;
  provider_variation_code?: string | null;
}

export async function bulkImportServicePlans(
  serviceId:           string,
  providerCode:        string,
  primaryProviderCode: string,
  plans:               BulkImportPlanInput[],
): Promise<{ created: number; skipped: number }> {
  // Skip plans whose variation_code already exists in this service
  const existing = await db("service_plans")
    .where("service_id", serviceId)
    .whereIn("variation_code", plans.map((p) => p.variation_code))
    .pluck("variation_code") as string[];

  const existingSet = new Set(existing);
  const toInsert = plans.filter((p) => !existingSet.has(p.variation_code));

  if (toInsert.length > 0) {
    await db("service_plans").insert(
      toInsert.map((p) => ({
        id:                     randomUUID(),
        service_id:             serviceId,
        provider_code:          providerCode,
        primary_provider_code:  primaryProviderCode,
        name:                   p.name,
        variation_code:         p.variation_code,
        amount:                 p.amount,
        cost_price:             p.cost_price   ?? null,
        selling_price:          p.selling_price ?? null,
        is_variable_amount:     false,
        is_active:              true,
        metadata:               JSON.stringify({}),
        provider_metadata:      JSON.stringify({}),
        network_operator:       p.network_operator       ?? null,
        plan_category:          p.plan_category          ?? null,
        duration_days:          p.duration_days          ?? null,
        provider_variation_code: p.provider_variation_code ?? null,
      })),
    );
  }

  return { created: toInsert.length, skipped: existingSet.size };
}

// ── Category provider summary / assignment ────────────────────────────────────

export interface CategoryProviderRow {
  service_type: string;
  network_operator: string | null;
  plan_category: string | null;
  plan_count: number;
  primary_provider_code: string | null;
  fallback_provider_code: string | null;
}

/** Distinct (service_type, network_operator, plan_category) groups with their majority provider. */
export async function getCategoryProviderSummary(): Promise<CategoryProviderRow[]> {
  const rows = await db("service_plans as sp")
    .join("catalog_services as cs", "cs.id", "sp.service_id")
    .whereNotNull("sp.network_operator")
    .groupBy("cs.service_type", "sp.network_operator", "sp.plan_category")
    .orderBy("cs.service_type", "asc")
    .orderBy("sp.network_operator", "asc")
    .orderBy("sp.plan_category", "asc")
    .select<{ service_type: string; network_operator: string; plan_category: string | null; plan_count: string; primary_provider_code: string | null; fallback_provider_code: string | null }[]>(
      "cs.service_type",
      "sp.network_operator",
      "sp.plan_category",
      db.raw("COUNT(*) AS plan_count"),
      // Representative value — if mixed, returns one of the set values
      db.raw("MAX(sp.primary_provider_code)  AS primary_provider_code"),
      db.raw("MAX(sp.fallback_provider_code) AS fallback_provider_code"),
    );

  return rows.map((r) => ({
    ...r,
    plan_count: parseInt(r.plan_count as unknown as string, 10),
  }));
}

/** Bulk-assign primary/fallback provider to all plans matching the given filters. */
export async function bulkAssignProvider(
  filters: {
    service_type: string;
    network_operator?: string | null;
    plan_category?: string | null;
  },
  primary_provider_code: string,
  fallback_provider_code?: string | null,
): Promise<number> {
  const base = db("service_plans as sp")
    .join("catalog_services as cs", "cs.id", "sp.service_id")
    .where("cs.service_type", filters.service_type);

  if (filters.network_operator) base.where("sp.network_operator", filters.network_operator);
  if (filters.plan_category !== undefined) {
    if (filters.plan_category === null) base.whereNull("sp.plan_category");
    else base.where("sp.plan_category", filters.plan_category);
  }

  const ids = await base.pluck("sp.id");
  if (ids.length === 0) return 0;

  const patch: Record<string, unknown> = { primary_provider_code, updated_at: new Date() };
  if (fallback_provider_code !== undefined) patch.fallback_provider_code = fallback_provider_code;

  await db("service_plans").whereIn("id", ids).update(patch);
  return ids.length;
}

export async function bulkClearProviderOverride(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db("service_plans")
    .whereIn("id", ids)
    .update({ primary_provider_code: null, fallback_provider_code: null, updated_at: new Date() });
  return ids.length;
}

export async function bulkSetProviderById(
  ids: string[],
  primary_provider_code: string,
  fallback_provider_code?: string | null,
): Promise<number> {
  if (ids.length === 0) return 0;
  const patch: Record<string, unknown> = { primary_provider_code, updated_at: new Date() };
  if (fallback_provider_code !== undefined) patch.fallback_provider_code = fallback_provider_code;
  await db("service_plans").whereIn("id", ids).update(patch);
  return ids.length;
}

// Returns the first active cable_tv plan for a given biller code to determine
// which provider handles verification for that biller.
export async function getCablePlanForBiller(billerCode: string) {
  return db("service_plans as sp")
    .join("catalog_services as cs", "cs.id", "sp.service_id")
    .where("cs.service_type", "cable_tv")
    .where("sp.network_operator", billerCode)
    .where("sp.is_active", true)
    .where("cs.is_active", true)
    .select(
      "sp.primary_provider_code",
      "sp.provider_code",
    )
    .first() as Promise<{ primary_provider_code: string | null; provider_code: string } | undefined>;
}

export async function getPlanByVariationCode(
  serviceType: string,
  variationCode: string
) {
  return db("service_plans")
    .join("catalog_services", "service_plans.service_id", "catalog_services.id")
    .where("catalog_services.service_type", serviceType)
    .where("service_plans.variation_code", variationCode)
    .where("service_plans.is_active", true)
    .where("catalog_services.is_active", true)
    // Block if network/operator is disabled
    .whereNotExists(
      db("service_availability_controls")
        .select(db.raw("1"))
        .where("service_availability_controls.is_active", false)
        .whereNull("service_availability_controls.plan_category")
        .whereRaw("service_availability_controls.service_type = catalog_services.service_type")
        .whereRaw("service_availability_controls.network_operator = service_plans.network_operator")
    )
    // Block if network+category combo is disabled
    .whereNotExists(
      db("service_availability_controls")
        .select(db.raw("1"))
        .where("service_availability_controls.is_active", false)
        .whereNotNull("service_availability_controls.plan_category")
        .whereRaw("service_availability_controls.service_type = catalog_services.service_type")
        .whereRaw("service_availability_controls.network_operator = service_plans.network_operator")
        .whereRaw("service_availability_controls.plan_category = service_plans.plan_category")
    )
    .select(
      "service_plans.id",
      "service_plans.variation_code",
      "service_plans.name",
      "service_plans.amount",
      "service_plans.selling_price",
      "service_plans.is_variable_amount",
      "service_plans.provider_code",
      "service_plans.primary_provider_code",
      "service_plans.fallback_provider_code",
      "service_plans.provider_variation_code",
      "service_plans.plan_category",
      "service_plans.network_operator",
      "catalog_services.slug as service_slug",
      "catalog_services.name as service_name"
    )
    .first();
}
