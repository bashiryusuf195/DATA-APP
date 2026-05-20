import { randomUUID } from "crypto";
import type { Knex } from "knex";

// ── Idempotent airtime catalog seed ──────────────────────────────────────────
//
// Why this migration exists:
//   The dev seed (01_service_catalog.ts) uses ON CONFLICT IGNORE, so it cannot
//   update rows that were inserted by an older version of the seed that lacked
//   airtime content, had missing network_operator values, or was never run at all
//   (production environments skip seeds entirely).
//
//   This migration guarantees that every environment — dev, staging, production —
//   has the four airtime network services and their standard VTU plans, with
//   network_operator and plan_category properly set, so that:
//     - Service Plans → Create Plan service dropdown shows Airtime services
//     - Service Availability shows MTN / Airtel / Glo / 9mobile operator groups
//     - Category Routing → Airtime tab shows per-network assignment rows
//     - Customer app airtime flow can route plans to providers
//
// All inserts use ON CONFLICT DO NOTHING (idempotent).
// The network_operator + plan_category backfill only updates NULL rows.

const PROVIDER = "mock_vtu_provider";

const AIRTIME_SERVICES = [
  { slug: "mtn-airtime",     name: "MTN Airtime",     service_type: "airtime" as const },
  { slug: "airtel-airtime",  name: "Airtel Airtime",  service_type: "airtime" as const },
  { slug: "glo-airtime",     name: "Glo Airtime",     service_type: "airtime" as const },
  { slug: "9mobile-airtime", name: "9mobile Airtime", service_type: "airtime" as const },
];

function airtimePlans(serviceId: string, operator: string, prefix: string) {
  const denoms = [50, 100, 200, 500, 1000, 2000, 5000];
  return denoms.map((amount) => ({
    id:                    randomUUID(),
    service_id:            serviceId,
    provider_code:         PROVIDER,
    name:                  `${operator} ₦${amount.toLocaleString()} Airtime`,
    variation_code:        `${prefix}-airtime-${amount}`,
    amount,
    cost_price:            null,
    selling_price:         null,
    is_variable_amount:    false,
    metadata:              JSON.stringify({}),
    is_active:             true,
    network_operator:      prefix,
    plan_category:         "vtu",
    duration_days:         null,
    primary_provider_code:   null,
    fallback_provider_code:  null,
    provider_variation_code: null,
    provider_metadata:     JSON.stringify({}),
  }));
}

export async function up(knex: Knex): Promise<void> {
  // ── 1. Ensure airtime catalog_services rows exist ─────────────────────────
  for (const svc of AIRTIME_SERVICES) {
    await knex("catalog_services")
      .insert({ id: randomUUID(), ...svc, is_active: true })
      .onConflict("slug")
      .ignore();
  }

  // ── 2. Re-fetch actual IDs (handles both fresh inserts and pre-existing rows)
  const svcRows = await knex("catalog_services")
    .whereIn("slug", AIRTIME_SERVICES.map((s) => s.slug))
    .select<{ id: string; slug: string }[]>("id", "slug");

  const svcId = Object.fromEntries(svcRows.map((r) => [r.slug, r.id]));

  // ── 3. Insert missing airtime plans ──────────────────────────────────────
  const plans = [
    ...airtimePlans(svcId["mtn-airtime"],     "MTN",     "mtn"),
    ...airtimePlans(svcId["airtel-airtime"],  "Airtel",  "airtel"),
    ...airtimePlans(svcId["glo-airtime"],     "Glo",     "glo"),
    ...airtimePlans(svcId["9mobile-airtime"], "9mobile", "9mobile"),
  ];

  for (const plan of plans) {
    await knex("service_plans")
      .insert(plan)
      .onConflict(["service_id", "variation_code"])
      .ignore();
  }

  // ── 4. Backfill network_operator for any airtime plans still NULL ─────────
  //    (handles plans inserted by an old seed run that lacked the column)
  await knex.raw(`
    UPDATE service_plans sp
    SET    network_operator = v.operator,
           updated_at       = NOW()
    FROM (
      VALUES
        ('mtn-airtime',       'mtn'),
        ('airtel-airtime',    'airtel'),
        ('glo-airtime',       'glo'),
        ('9mobile-airtime',   '9mobile')
    ) AS v(slug, operator)
    JOIN catalog_services cs ON cs.slug = v.slug
    WHERE sp.service_id      = cs.id
      AND sp.network_operator IS NULL
  `);

  // ── 5. Backfill plan_category = 'vtu' for existing airtime plans ──────────
  //    Only touches rows that have a network_operator (i.e. proper airtime plans)
  //    but no category yet.
  await knex.raw(`
    UPDATE service_plans sp
    SET    plan_category = 'vtu',
           updated_at    = NOW()
    FROM   catalog_services cs
    WHERE  sp.service_id       = cs.id
      AND  cs.service_type     = 'airtime'
      AND  sp.network_operator IS NOT NULL
      AND  sp.plan_category    IS NULL
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Data migrations are not reversed automatically.
  // To undo: remove inserted rows via the admin Service Plans UI
  // or run: DELETE FROM service_plans sp USING catalog_services cs
  //         WHERE sp.service_id = cs.id AND cs.service_type = 'airtime';
  //         DELETE FROM catalog_services WHERE service_type = 'airtime';
}
