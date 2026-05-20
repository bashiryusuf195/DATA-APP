import type { Knex } from "knex";

// ── Backfill: network_operator for identity, airtime, and electricity disco plans
//
// Extends 20260518270000_backfill_plan_operator_category which covered data,
// cable_tv, and exam_pin but omitted identity_verification and airtime.
//
// Pass 1 — slug join: covers plans whose services have operator-specific slugs
//          (nin-verification, bvn-verification, mtn-airtime, etc.)
//
// Pass 2 — identity pattern: covers any identity plans not reachable by slug
//          (e.g. imported from providers using generic "identity" service).
//
// Pass 3 — airtime pattern: covers any airtime plans not reachable by slug.
//
// All passes are idempotent (WHERE network_operator IS NULL).

export async function up(knex: Knex): Promise<void> {
  // ── Pass 1: slug-based operator assignment ────────────────────────────────
  await knex.raw(`
    UPDATE service_plans sp
    SET    network_operator = v.operator,
           updated_at       = NOW()
    FROM (
      VALUES
        ('nin-verification',  'nin'),
        ('bvn-verification',  'bvn'),
        ('mtn-airtime',       'mtn'),
        ('airtel-airtime',    'airtel'),
        ('glo-airtime',       'glo'),
        ('9mobile-airtime',   '9mobile'),
        ('ekedc',             'ekedc'),
        ('ikedc',             'ikedc'),
        ('aedc',              'aedc'),
        ('phed',              'phed'),
        ('kedco',             'kedco'),
        ('abdc',              'abdc'),
        ('bedc',              'bedc'),
        ('eedc',              'eedc'),
        ('jedc',              'jedc'),
        ('kaedc',             'kaedc')
    ) AS v(slug, operator)
    JOIN catalog_services cs ON cs.slug = v.slug
    WHERE sp.service_id      = cs.id
      AND sp.network_operator IS NULL
  `);

  // ── Pass 2: identity plans — variation_code or name contains nin/bvn ─────
  await knex.raw(`
    UPDATE service_plans sp
    SET    network_operator = CASE
             WHEN LOWER(sp.variation_code) = 'nin'
               OR LOWER(sp.name) LIKE '%nin%'     THEN 'nin'
             WHEN LOWER(sp.variation_code) = 'bvn'
               OR LOWER(sp.name) LIKE '%bvn%'     THEN 'bvn'
           END,
           updated_at = NOW()
    FROM   catalog_services cs
    WHERE  sp.service_id       = cs.id
      AND  cs.service_type     = 'identity_verification'
      AND  sp.network_operator IS NULL
      AND  (
             LOWER(sp.variation_code) IN ('nin', 'bvn')
          OR LOWER(sp.name) SIMILAR TO '%(nin|bvn)%'
           )
  `);

  // ── Pass 3: airtime plans — leading operator word in name / variation_code ─
  await knex.raw(`
    UPDATE service_plans sp
    SET    network_operator = CASE
             WHEN LOWER(sp.name) LIKE 'mtn %'     OR LOWER(sp.variation_code) LIKE 'mtn-%'     THEN 'mtn'
             WHEN LOWER(sp.name) LIKE 'airtel %'   OR LOWER(sp.variation_code) LIKE 'airtel-%'   THEN 'airtel'
             WHEN LOWER(sp.name) LIKE 'glo %'      OR LOWER(sp.variation_code) LIKE 'glo-%'      THEN 'glo'
             WHEN LOWER(sp.name) LIKE '9mobile %'  OR LOWER(sp.variation_code) LIKE '9mobile-%'  THEN '9mobile'
           END,
           updated_at = NOW()
    FROM   catalog_services cs
    WHERE  sp.service_id       = cs.id
      AND  cs.service_type     = 'airtime'
      AND  sp.network_operator IS NULL
      AND  (
             LOWER(sp.name)           SIMILAR TO '(mtn|airtel|glo|9mobile) %'
          OR LOWER(sp.variation_code) SIMILAR TO '(mtn|airtel|glo|9mobile)-%'
           )
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Intentional no-op: data backfills are not reversible without knowing
  // the prior state. To undo, update records manually via the admin UI.
}
