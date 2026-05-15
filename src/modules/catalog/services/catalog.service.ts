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
      "catalog_services.slug as service_slug",
      "catalog_services.name as service_name"
    )
    .first();
}
