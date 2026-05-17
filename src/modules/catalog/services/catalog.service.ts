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

export async function adminListServicePlans(filters: {
  service_id?: string;
  provider_code?: string;
  search?: string;
  is_active?: boolean;
}) {
  return db("service_plans as sp")
    .join("catalog_services as cs", "cs.id", "sp.service_id")
    .modify((q) => {
      if (filters.service_id) q.where("sp.service_id", filters.service_id);
      if (filters.provider_code) q.where("sp.provider_code", filters.provider_code);
      if (filters.is_active !== undefined) q.where("sp.is_active", filters.is_active);
      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("sp.name ILIKE ?", [term])
            .orWhereRaw("sp.variation_code ILIKE ?", [term]);
        });
      }
    })
    .orderBy("cs.service_type", "asc")
    .orderBy("sp.amount", "asc")
    .select<{
      id: string; service_id: string; provider_code: string; name: string;
      variation_code: string; amount: string; cost_price: string | null;
      selling_price: string | null; is_variable_amount: boolean;
      metadata: Record<string, unknown>; is_active: boolean;
      created_at: string; updated_at: string;
      service_slug: string; service_name: string; service_type: string;
      primary_provider_code: string | null; fallback_provider_code: string | null;
      provider_variation_code: string | null; provider_metadata: Record<string, unknown>;
    }[]>(
      "sp.id", "sp.service_id", "sp.provider_code", "sp.name",
      "sp.variation_code", "sp.amount", "sp.cost_price", "sp.selling_price",
      "sp.is_variable_amount", "sp.metadata", "sp.is_active",
      "sp.created_at", "sp.updated_at",
      "sp.primary_provider_code", "sp.fallback_provider_code",
      "sp.provider_variation_code", "sp.provider_metadata",
      db.raw("cs.slug AS service_slug"),
      db.raw("cs.name AS service_name"),
      db.raw("cs.service_type AS service_type"),
    );
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
      "catalog_services.slug as service_slug",
      "catalog_services.name as service_name"
    )
    .first();
}
