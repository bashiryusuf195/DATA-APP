import type { Knex } from "knex";

// ── Backfill: populate network_operator and plan_category on service_plans ────
//
// Pass 1 — slug join: most reliable, covers all seeded/imported data whose
//          services were created with operator-specific slugs (e.g. "mtn-data").
//
// Pass 2 — name/code pattern: catches plans inserted directly by providers
//          (VTPass, etc.) where the name starts with the operator name
//          (e.g. "MTN 2GB Corporate SME 30 Days").
//
// Pass 3 — category pattern: infers plan_category from keywords in name/code.
//          Conservative — only matches unambiguous keywords (sme, corporate,
//          gifting, dnd, social). Duration is stored in duration_days, not here.
//
// All three passes are idempotent: only rows with NULL values are touched.

export async function up(knex: Knex): Promise<void> {
  // ── Pass 1: slug-based operator assignment ────────────────────────────────
  // Maps catalog_services.slug → network_operator value
  await knex.raw(`
    UPDATE service_plans sp
    SET    network_operator = v.operator,
           updated_at       = NOW()
    FROM (
      VALUES
        ('mtn-data',          'mtn'),
        ('mtn-airtime',       'mtn'),
        ('airtel-data',       'airtel'),
        ('airtel-airtime',    'airtel'),
        ('glo-data',          'glo'),
        ('glo-airtime',       'glo'),
        ('9mobile-data',      '9mobile'),
        ('9mobile-airtime',   '9mobile'),
        ('dstv',              'dstv'),
        ('gotv',              'gotv'),
        ('startimes',         'startimes'),
        ('waec',              'waec'),
        ('neco',              'neco'),
        ('jamb',              'jamb'),
        ('ekedc',             'ekedc'),
        ('ikedc',             'ikedc'),
        ('aedc',              'aedc'),
        ('phed',              'phed'),
        ('abdc',              'abdc'),
        ('bedc',              'bedc'),
        ('eedc',              'eedc'),
        ('jedc',              'jedc'),
        ('kedco',             'kedco'),
        ('kaedc',             'kaedc')
    ) AS v(slug, operator)
    JOIN catalog_services cs ON cs.slug = v.slug
    WHERE sp.service_id      = cs.id
      AND sp.network_operator IS NULL
  `);

  // ── Pass 2: name/code pattern fallback for provider-imported plans ─────────
  // Covers plans not reachable by slug (custom slugs, imported without slug map).
  // Uses leading-word match on name and hyphen-prefix match on variation_code.
  await knex.raw(`
    UPDATE service_plans
    SET    network_operator = CASE
             WHEN LOWER(name) LIKE 'mtn %'       OR LOWER(variation_code) LIKE 'mtn-%'       THEN 'mtn'
             WHEN LOWER(name) LIKE 'airtel %'     OR LOWER(variation_code) LIKE 'airtel-%'     THEN 'airtel'
             WHEN LOWER(name) LIKE 'glo %'        OR LOWER(variation_code) LIKE 'glo-%'        THEN 'glo'
             WHEN LOWER(name) LIKE '9mobile %'    OR LOWER(variation_code) LIKE '9mobile-%'    THEN '9mobile'
             WHEN LOWER(name) LIKE 'dstv %'       OR LOWER(variation_code) LIKE 'dstv-%'       THEN 'dstv'
             WHEN LOWER(name) LIKE 'gotv %'       OR LOWER(variation_code) LIKE 'gotv-%'       THEN 'gotv'
             WHEN LOWER(name) LIKE 'startimes %'  OR LOWER(variation_code) LIKE 'startimes-%'  THEN 'startimes'
             WHEN LOWER(name) LIKE 'waec %'       OR LOWER(variation_code) LIKE 'waec-%'       THEN 'waec'
             WHEN LOWER(name) LIKE 'neco %'       OR LOWER(variation_code) LIKE 'neco-%'       THEN 'neco'
             WHEN LOWER(name) LIKE 'jamb %'       OR LOWER(variation_code) LIKE 'jamb-%'       THEN 'jamb'
           END,
           updated_at = NOW()
    WHERE  network_operator IS NULL
      AND (
        LOWER(name)           SIMILAR TO '(mtn|airtel|glo|9mobile|dstv|gotv|startimes|waec|neco|jamb) %'
        OR LOWER(variation_code) SIMILAR TO '(mtn|airtel|glo|9mobile|dstv|gotv|startimes|waec|neco|jamb)-%'
      )
  `);

  // ── Pass 3: plan_category keyword inference ────────────────────────────────
  // Conservative: only clear, unambiguous product-type keywords are matched.
  // Duration-based classification (daily/weekly/monthly) is stored in
  // duration_days — not in plan_category — to avoid ambiguity.
  await knex.raw(`
    UPDATE service_plans
    SET    plan_category = CASE
             WHEN LOWER(name) LIKE '%sme%'         OR LOWER(variation_code) LIKE '%-sme%'         THEN 'sme'
             WHEN LOWER(name) LIKE '%corporate%'    OR LOWER(variation_code) LIKE '%-corp%'         THEN 'corporate'
             WHEN LOWER(name) LIKE '%gifting%'      OR LOWER(variation_code) LIKE '%-gifting%'      THEN 'gifting'
             WHEN LOWER(name) LIKE '% dnd%'         OR LOWER(variation_code) LIKE '%-dnd%'          THEN 'dnd'
             WHEN LOWER(name) LIKE '%social%'       OR LOWER(variation_code) LIKE '%-social%'       THEN 'social'
             WHEN LOWER(name) LIKE '%direct%'       OR LOWER(variation_code) LIKE '%-direct%'       THEN 'direct'
           END,
           updated_at = NOW()
    WHERE  plan_category IS NULL
      AND (
        LOWER(name)              SIMILAR TO '%(sme|corporate|gifting|dnd|social|direct)%'
        OR LOWER(variation_code) SIMILAR TO '%(sme|corp|gifting|dnd|social|direct)%'
      )
  `);

  // ── Pass 4: duration_days from variation_code patterns ────────────────────
  // Only fills rows that have no duration yet and a clear day pattern in code.
  await knex.raw(`
    UPDATE service_plans
    SET    duration_days = CASE
             WHEN LOWER(variation_code) LIKE '%-1day%'    OR LOWER(variation_code) LIKE '%-daily%'   THEN 1
             WHEN LOWER(variation_code) LIKE '%-7days%'                                              THEN 7
             WHEN LOWER(variation_code) LIKE '%-14days%'                                             THEN 14
             WHEN LOWER(variation_code) LIKE '%-30days%'  OR LOWER(variation_code) LIKE '%-monthly%' THEN 30
             WHEN LOWER(variation_code) LIKE '%-60days%'                                             THEN 60
             WHEN LOWER(variation_code) LIKE '%-90days%'  OR LOWER(variation_code) LIKE '%-quarter%' THEN 90
             WHEN LOWER(variation_code) LIKE '%-365days%' OR LOWER(variation_code) LIKE '%-annual%'  THEN 365
           END,
           updated_at = NOW()
    WHERE  duration_days IS NULL
      AND  LOWER(variation_code) SIMILAR TO '%(day|days|daily|monthly|quarter|annual)%'
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Intentional no-op: data backfills are not reversible without knowing
  // the prior state. To undo, update records manually via the admin UI.
}
