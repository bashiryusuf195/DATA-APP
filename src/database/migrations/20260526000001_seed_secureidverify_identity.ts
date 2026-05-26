import { randomUUID } from "crypto";
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── 1. Provider config ──────────────────────────────────────────────────────
  await knex("provider_configs")
    .insert({
      id:                 randomUUID(),
      provider_code:      "secureidverify",
      name:               "SecureIDVerify",
      is_active:          false,
      priority:           10,
      health_status:      "unknown",
      supported_services: JSON.stringify(["identity_verification"]),
      metadata:           JSON.stringify({}),
    })
    .onConflict("provider_code")
    .ignore();

  // ── 2. Catalog services (idempotent — may already exist from seed) ──────────
  for (const row of [
    { slug: "nin-verification", name: "NIN Verification" },
    { slug: "bvn-verification", name: "BVN Verification" },
  ]) {
    await knex("catalog_services")
      .insert({
        id:           randomUUID(),
        slug:         row.slug,
        name:         row.name,
        service_type: "identity_verification",
        is_active:    true,
        created_at:   new Date(),
        updated_at:   new Date(),
      })
      .onConflict("slug")
      .ignore();
  }

  const ninSvc = await knex("catalog_services").where({ slug: "nin-verification" }).first();
  const bvnSvc = await knex("catalog_services").where({ slug: "bvn-verification" }).first();

  if (!ninSvc || !bvnSvc) {
    throw new Error("Migration: could not resolve identity_verification catalog_services");
  }

  // ── 3. Service plans ────────────────────────────────────────────────────────
  const plans = [
    {
      service_id:    ninSvc.id as string,
      network_operator: "nin",
      plan_category: "information",
      name:          "NIN Information",
      variation_code:"nin-information",
      amount:        200,
      selling_price: 250,
    },
    {
      service_id:    ninSvc.id as string,
      network_operator: "nin",
      plan_category: "standard",
      name:          "NIN Standard",
      variation_code:"nin-standard",
      amount:        500,
      selling_price: 600,
    },
    {
      service_id:    ninSvc.id as string,
      network_operator: "nin",
      plan_category: "premium",
      name:          "NIN Premium",
      variation_code:"nin-premium",
      amount:        1000,
      selling_price: 1200,
    },
    {
      service_id:    bvnSvc.id as string,
      network_operator: "bvn",
      plan_category: "basic",
      name:          "BVN Basic",
      variation_code:"bvn-basic",
      amount:        200,
      selling_price: 250,
    },
  ];

  for (const plan of plans) {
    await knex("service_plans")
      .insert({
        id:               randomUUID(),
        service_id:       plan.service_id,
        provider_code:    "secureidverify",
        network_operator: plan.network_operator,
        plan_category:    plan.plan_category,
        name:             plan.name,
        variation_code:   plan.variation_code,
        amount:           plan.amount,
        selling_price:    plan.selling_price,
        is_active:        true,
        created_at:       new Date(),
        updated_at:       new Date(),
      })
      .onConflict(["service_id", "variation_code"])
      .merge({
        provider_code:    "secureidverify",
        plan_category:    plan.plan_category,
        name:             plan.name,
        amount:           plan.amount,
        selling_price:    plan.selling_price,
        updated_at:       new Date(),
      });
  }

  // ── 4. Routing rule (disabled until credentials are configured) ─────────────
  // Insert only if no rule for identity_verification already exists.
  const existing = await knex("provider_routing_rules")
    .where({ service_type: "identity_verification" })
    .first();

  if (!existing) {
    await knex("provider_routing_rules").insert({
      id:                     randomUUID(),
      service_type:           "identity_verification",
      primary_provider_code:  "secureidverify",
      fallback_provider_code: null,
      is_active:              false,
      metadata:               JSON.stringify({}),
      created_at:             new Date(),
      updated_at:             new Date(),
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("service_plans")
    .whereIn("variation_code", ["nin-information", "nin-standard", "nin-premium", "bvn-basic"])
    .where("provider_code", "secureidverify")
    .delete();

  await knex("provider_configs")
    .where({ provider_code: "secureidverify" })
    .delete();

  await knex("provider_routing_rules")
    .where({ service_type: "identity_verification", primary_provider_code: "secureidverify" })
    .delete();
}
