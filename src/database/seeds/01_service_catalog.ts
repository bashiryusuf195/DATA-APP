import { randomUUID } from "crypto";
import type { Knex } from "knex";

// Pre-defined service UUIDs so plan inserts can reference them
// without a round-trip query per service.
const SVC = {
  MTN_DATA:       randomUUID(),
  AIRTEL_DATA:    randomUUID(),
  GLO_DATA:       randomUUID(),
  MOBILE9_DATA:   randomUUID(),
  DSTV:           randomUUID(),
  GOTV:           randomUUID(),
  STARTIMES:      randomUUID(),
  WAEC:           randomUUID(),
  NECO:           randomUUID(),
  ELECTRICITY:    randomUUID(),
  NIN_VERIFY:     randomUUID(),
  BVN_VERIFY:     randomUUID(),
};

const PROVIDER = "mock_vtu_provider";

export async function seed(knex: Knex): Promise<void> {
  // ── 1. Services ──────────────────────────────────────────────
  const services = [
    { id: SVC.MTN_DATA,     slug: "mtn-data",          name: "MTN Data",          service_type: "data" },
    { id: SVC.AIRTEL_DATA,  slug: "airtel-data",        name: "Airtel Data",        service_type: "data" },
    { id: SVC.GLO_DATA,     slug: "glo-data",           name: "Glo Data",           service_type: "data" },
    { id: SVC.MOBILE9_DATA, slug: "9mobile-data",       name: "9mobile Data",       service_type: "data" },
    { id: SVC.DSTV,         slug: "dstv",               name: "DStv",               service_type: "cable_tv" },
    { id: SVC.GOTV,         slug: "gotv",               name: "GOtv",               service_type: "cable_tv" },
    { id: SVC.STARTIMES,    slug: "startimes",          name: "StarTimes",          service_type: "cable_tv" },
    { id: SVC.WAEC,         slug: "waec",               name: "WAEC",               service_type: "exam_pin" },
    { id: SVC.NECO,         slug: "neco",               name: "NECO",               service_type: "exam_pin" },
    { id: SVC.ELECTRICITY,  slug: "electricity",        name: "Electricity",        service_type: "electricity" },
    { id: SVC.NIN_VERIFY,   slug: "nin-verification",   name: "NIN Verification",   service_type: "identity_verification" },
    { id: SVC.BVN_VERIFY,   slug: "bvn-verification",   name: "BVN Verification",   service_type: "identity_verification" },
  ];

  await knex("catalog_services")
    .insert(services)
    .onConflict("slug")
    .ignore();

  // Re-fetch actual IDs so this seed is idempotent on subsequent runs
  const rows = await knex("catalog_services")
    .whereIn("slug", services.map((s) => s.slug))
    .select("id", "slug");

  const id = Object.fromEntries(rows.map((r) => [r.slug, r.id]));

  // ── 2. Plans ─────────────────────────────────────────────────
  const plans = [
    // ── MTN Data ─────────────────────────────────────────────
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, name: "MTN 500MB – 7 Days",    variation_code: "mtn-500mb-7days",   amount: 150 },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, name: "MTN 1GB – 30 Days",     variation_code: "mtn-1gb-30days",    amount: 300 },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, name: "MTN 2GB – 30 Days",     variation_code: "mtn-2gb-30days",    amount: 500 },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, name: "MTN 5GB – 30 Days",     variation_code: "mtn-5gb-30days",    amount: 1500 },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, name: "MTN 10GB – 30 Days",    variation_code: "mtn-10gb-30days",   amount: 2500 },

    // ── Airtel Data ───────────────────────────────────────────
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, name: "Airtel 500MB – 7 Days",  variation_code: "airtel-500mb-7days",  amount: 150 },
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, name: "Airtel 1GB – 30 Days",   variation_code: "airtel-1gb-30days",   amount: 300 },
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, name: "Airtel 2GB – 30 Days",   variation_code: "airtel-2gb-30days",   amount: 500 },
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, name: "Airtel 5GB – 30 Days",   variation_code: "airtel-5gb-30days",   amount: 1500 },

    // ── Glo Data ─────────────────────────────────────────────
    { id: randomUUID(), service_id: id["glo-data"], provider_code: PROVIDER, name: "Glo 500MB – 7 Days",   variation_code: "glo-500mb-7days",   amount: 125 },
    { id: randomUUID(), service_id: id["glo-data"], provider_code: PROVIDER, name: "Glo 1GB – 30 Days",    variation_code: "glo-1gb-30days",    amount: 275 },
    { id: randomUUID(), service_id: id["glo-data"], provider_code: PROVIDER, name: "Glo 2GB – 30 Days",    variation_code: "glo-2gb-30days",    amount: 450 },

    // ── 9mobile Data ─────────────────────────────────────────
    { id: randomUUID(), service_id: id["9mobile-data"], provider_code: PROVIDER, name: "9mobile 500MB – 7 Days", variation_code: "9mobile-500mb-7days", amount: 200 },
    { id: randomUUID(), service_id: id["9mobile-data"], provider_code: PROVIDER, name: "9mobile 1GB – 30 Days",  variation_code: "9mobile-1gb-30days",  amount: 500 },

    // ── DStv ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, name: "DStv Padi",          variation_code: "dstv-padi",          amount: 1850 },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, name: "DStv Yanga",         variation_code: "dstv-yanga",         amount: 2565 },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, name: "DStv Confam",        variation_code: "dstv-confam",        amount: 3310 },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, name: "DStv Compact",       variation_code: "dstv-compact",       amount: 9000 },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, name: "DStv Compact Plus",  variation_code: "dstv-compact-plus",  amount: 14250 },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, name: "DStv Premium",       variation_code: "dstv-premium",       amount: 24750 },

    // ── GOtv ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, name: "GOtv Smallie", variation_code: "gotv-smallie", amount: 900 },
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, name: "GOtv Jolli",   variation_code: "gotv-jolli",   amount: 2460 },
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, name: "GOtv Max",     variation_code: "gotv-max",     amount: 4150 },
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, name: "GOtv Supa",    variation_code: "gotv-supa",    amount: 6400 },

    // ── StarTimes ─────────────────────────────────────────────
    { id: randomUUID(), service_id: id["startimes"], provider_code: PROVIDER, name: "StarTimes Nova",  variation_code: "startimes-nova",  amount: 900 },
    { id: randomUUID(), service_id: id["startimes"], provider_code: PROVIDER, name: "StarTimes Basic", variation_code: "startimes-basic", amount: 1700 },
    { id: randomUUID(), service_id: id["startimes"], provider_code: PROVIDER, name: "StarTimes Smart", variation_code: "startimes-smart", amount: 2200 },

    // ── WAEC ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["waec"], provider_code: PROVIDER, name: "WAEC Result Checker", variation_code: "waec-result-checker", amount: 1050 },
    { id: randomUUID(), service_id: id["waec"], provider_code: PROVIDER, name: "WAEC Scratch Card",   variation_code: "waec-scratch-card",   amount: 4050 },

    // ── NECO ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["neco"], provider_code: PROVIDER, name: "NECO Result Checker", variation_code: "neco-result-checker", amount: 750 },
    { id: randomUUID(), service_id: id["neco"], provider_code: PROVIDER, name: "NECO Scratch Card",   variation_code: "neco-scratch-card",   amount: 1200 },

    // ── Electricity (variable amount — user sets top-up value) ─
    {
      id: randomUUID(), service_id: id["electricity"], provider_code: PROVIDER,
      name: "Prepaid Electricity",  variation_code: "prepaid",
      amount: 0, is_variable_amount: true,
    },
    {
      id: randomUUID(), service_id: id["electricity"], provider_code: PROVIDER,
      name: "Postpaid Electricity", variation_code: "postpaid",
      amount: 0, is_variable_amount: true,
    },

    // ── Identity Verification ─────────────────────────────────
    { id: randomUUID(), service_id: id["nin-verification"], provider_code: PROVIDER, name: "NIN Lookup", variation_code: "nin", amount: 150 },
    { id: randomUUID(), service_id: id["bvn-verification"], provider_code: PROVIDER, name: "BVN Lookup", variation_code: "bvn", amount: 150 },
  ];

  await knex("service_plans")
    .insert(plans)
    .onConflict(["service_id", "variation_code"])
    .ignore();
}
