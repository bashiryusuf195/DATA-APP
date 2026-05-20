import { randomUUID } from "crypto";
import type { Knex } from "knex";

// Pre-defined service UUIDs so plan inserts can reference them
// without a round-trip query per service.
const SVC = {
  // Data
  MTN_DATA:        randomUUID(),
  AIRTEL_DATA:     randomUUID(),
  GLO_DATA:        randomUUID(),
  MOBILE9_DATA:    randomUUID(),
  // Airtime
  MTN_AIRTIME:     randomUUID(),
  AIRTEL_AIRTIME:  randomUUID(),
  GLO_AIRTIME:     randomUUID(),
  MOBILE9_AIRTIME: randomUUID(),
  // Cable TV
  DSTV:            randomUUID(),
  GOTV:            randomUUID(),
  STARTIMES:       randomUUID(),
  // Exams
  WAEC:            randomUUID(),
  NECO:            randomUUID(),
  // Electricity — generic (backward compat) + per-disco
  ELECTRICITY:     randomUUID(),
  EKEDC:           randomUUID(),
  IKEDC:           randomUUID(),
  AEDC:            randomUUID(),
  PHED:            randomUUID(),
  KEDCO:           randomUUID(),
  // Identity verification
  NIN_VERIFY:      randomUUID(),
  BVN_VERIFY:      randomUUID(),
};

const PROVIDER = "mock_vtu_provider";

export async function seed(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.warn("[seed] 01_service_catalog skipped in production");
    return;
  }

  // ── 1. Services ──────────────────────────────────────────────
  const services = [
    // Data
    { id: SVC.MTN_DATA,        slug: "mtn-data",          name: "MTN Data",          service_type: "data" },
    { id: SVC.AIRTEL_DATA,     slug: "airtel-data",        name: "Airtel Data",        service_type: "data" },
    { id: SVC.GLO_DATA,        slug: "glo-data",           name: "Glo Data",           service_type: "data" },
    { id: SVC.MOBILE9_DATA,    slug: "9mobile-data",       name: "9mobile Data",       service_type: "data" },
    // Airtime
    { id: SVC.MTN_AIRTIME,     slug: "mtn-airtime",        name: "MTN Airtime",        service_type: "airtime" },
    { id: SVC.AIRTEL_AIRTIME,  slug: "airtel-airtime",     name: "Airtel Airtime",     service_type: "airtime" },
    { id: SVC.GLO_AIRTIME,     slug: "glo-airtime",        name: "Glo Airtime",        service_type: "airtime" },
    { id: SVC.MOBILE9_AIRTIME, slug: "9mobile-airtime",    name: "9mobile Airtime",    service_type: "airtime" },
    // Cable TV
    { id: SVC.DSTV,            slug: "dstv",               name: "DStv",               service_type: "cable_tv" },
    { id: SVC.GOTV,            slug: "gotv",               name: "GOtv",               service_type: "cable_tv" },
    { id: SVC.STARTIMES,       slug: "startimes",          name: "StarTimes",          service_type: "cable_tv" },
    // Exams
    { id: SVC.WAEC,            slug: "waec",               name: "WAEC",               service_type: "exam_pin" },
    { id: SVC.NECO,            slug: "neco",               name: "NECO",               service_type: "exam_pin" },
    // Electricity — generic kept for backward compat; per-disco used for availability groups
    { id: SVC.ELECTRICITY,     slug: "electricity",        name: "Electricity",        service_type: "electricity" },
    { id: SVC.EKEDC,           slug: "ekedc",              name: "EKEDC",              service_type: "electricity" },
    { id: SVC.IKEDC,           slug: "ikedc",              name: "IKEDC",              service_type: "electricity" },
    { id: SVC.AEDC,            slug: "aedc",               name: "AEDC",               service_type: "electricity" },
    { id: SVC.PHED,            slug: "phed",               name: "PHED",               service_type: "electricity" },
    { id: SVC.KEDCO,           slug: "kedco",              name: "KEDCO",              service_type: "electricity" },
    // Identity verification
    { id: SVC.NIN_VERIFY,      slug: "nin-verification",   name: "NIN Verification",   service_type: "identity_verification" },
    { id: SVC.BVN_VERIFY,      slug: "bvn-verification",   name: "BVN Verification",   service_type: "identity_verification" },
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
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN 500MB – 7 Days",    variation_code: "mtn-500mb-7days",   amount: 150,  duration_days: 7  },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN 1GB – 30 Days",     variation_code: "mtn-1gb-30days",    amount: 300,  duration_days: 30 },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN 2GB – 30 Days",     variation_code: "mtn-2gb-30days",    amount: 500,  duration_days: 30 },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN 5GB – 30 Days",     variation_code: "mtn-5gb-30days",    amount: 1500, duration_days: 30 },
    { id: randomUUID(), service_id: id["mtn-data"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN 10GB – 30 Days",    variation_code: "mtn-10gb-30days",   amount: 2500, duration_days: 30 },

    // ── Airtel Data ───────────────────────────────────────────
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel 500MB – 7 Days",  variation_code: "airtel-500mb-7days",  amount: 150,  duration_days: 7  },
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel 1GB – 30 Days",   variation_code: "airtel-1gb-30days",   amount: 300,  duration_days: 30 },
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel 2GB – 30 Days",   variation_code: "airtel-2gb-30days",   amount: 500,  duration_days: 30 },
    { id: randomUUID(), service_id: id["airtel-data"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel 5GB – 30 Days",   variation_code: "airtel-5gb-30days",   amount: 1500, duration_days: 30 },

    // ── Glo Data ─────────────────────────────────────────────
    { id: randomUUID(), service_id: id["glo-data"], provider_code: PROVIDER, network_operator: "glo", name: "Glo 500MB – 7 Days",   variation_code: "glo-500mb-7days",   amount: 125, duration_days: 7  },
    { id: randomUUID(), service_id: id["glo-data"], provider_code: PROVIDER, network_operator: "glo", name: "Glo 1GB – 30 Days",    variation_code: "glo-1gb-30days",    amount: 275, duration_days: 30 },
    { id: randomUUID(), service_id: id["glo-data"], provider_code: PROVIDER, network_operator: "glo", name: "Glo 2GB – 30 Days",    variation_code: "glo-2gb-30days",    amount: 450, duration_days: 30 },

    // ── 9mobile Data ─────────────────────────────────────────
    { id: randomUUID(), service_id: id["9mobile-data"], provider_code: PROVIDER, network_operator: "9mobile", name: "9mobile 500MB – 7 Days", variation_code: "9mobile-500mb-7days", amount: 200, duration_days: 7  },
    { id: randomUUID(), service_id: id["9mobile-data"], provider_code: PROVIDER, network_operator: "9mobile", name: "9mobile 1GB – 30 Days",  variation_code: "9mobile-1gb-30days",  amount: 500, duration_days: 30 },

    // ── MTN Airtime ───────────────────────────────────────────
    { id: randomUUID(), service_id: id["mtn-airtime"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN ₦50 Airtime",    variation_code: "mtn-airtime-50",    amount: 50   },
    { id: randomUUID(), service_id: id["mtn-airtime"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN ₦100 Airtime",   variation_code: "mtn-airtime-100",   amount: 100  },
    { id: randomUUID(), service_id: id["mtn-airtime"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN ₦200 Airtime",   variation_code: "mtn-airtime-200",   amount: 200  },
    { id: randomUUID(), service_id: id["mtn-airtime"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN ₦500 Airtime",   variation_code: "mtn-airtime-500",   amount: 500  },
    { id: randomUUID(), service_id: id["mtn-airtime"], provider_code: PROVIDER, network_operator: "mtn", name: "MTN ₦1000 Airtime",  variation_code: "mtn-airtime-1000",  amount: 1000 },

    // ── Airtel Airtime ────────────────────────────────────────
    { id: randomUUID(), service_id: id["airtel-airtime"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel ₦50 Airtime",   variation_code: "airtel-airtime-50",   amount: 50   },
    { id: randomUUID(), service_id: id["airtel-airtime"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel ₦100 Airtime",  variation_code: "airtel-airtime-100",  amount: 100  },
    { id: randomUUID(), service_id: id["airtel-airtime"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel ₦200 Airtime",  variation_code: "airtel-airtime-200",  amount: 200  },
    { id: randomUUID(), service_id: id["airtel-airtime"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel ₦500 Airtime",  variation_code: "airtel-airtime-500",  amount: 500  },
    { id: randomUUID(), service_id: id["airtel-airtime"], provider_code: PROVIDER, network_operator: "airtel", name: "Airtel ₦1000 Airtime", variation_code: "airtel-airtime-1000", amount: 1000 },

    // ── Glo Airtime ───────────────────────────────────────────
    { id: randomUUID(), service_id: id["glo-airtime"], provider_code: PROVIDER, network_operator: "glo", name: "Glo ₦50 Airtime",    variation_code: "glo-airtime-50",    amount: 50   },
    { id: randomUUID(), service_id: id["glo-airtime"], provider_code: PROVIDER, network_operator: "glo", name: "Glo ₦100 Airtime",   variation_code: "glo-airtime-100",   amount: 100  },
    { id: randomUUID(), service_id: id["glo-airtime"], provider_code: PROVIDER, network_operator: "glo", name: "Glo ₦200 Airtime",   variation_code: "glo-airtime-200",   amount: 200  },
    { id: randomUUID(), service_id: id["glo-airtime"], provider_code: PROVIDER, network_operator: "glo", name: "Glo ₦500 Airtime",   variation_code: "glo-airtime-500",   amount: 500  },
    { id: randomUUID(), service_id: id["glo-airtime"], provider_code: PROVIDER, network_operator: "glo", name: "Glo ₦1000 Airtime",  variation_code: "glo-airtime-1000",  amount: 1000 },

    // ── 9mobile Airtime ───────────────────────────────────────
    { id: randomUUID(), service_id: id["9mobile-airtime"], provider_code: PROVIDER, network_operator: "9mobile", name: "9mobile ₦50 Airtime",   variation_code: "9mobile-airtime-50",   amount: 50   },
    { id: randomUUID(), service_id: id["9mobile-airtime"], provider_code: PROVIDER, network_operator: "9mobile", name: "9mobile ₦100 Airtime",  variation_code: "9mobile-airtime-100",  amount: 100  },
    { id: randomUUID(), service_id: id["9mobile-airtime"], provider_code: PROVIDER, network_operator: "9mobile", name: "9mobile ₦200 Airtime",  variation_code: "9mobile-airtime-200",  amount: 200  },
    { id: randomUUID(), service_id: id["9mobile-airtime"], provider_code: PROVIDER, network_operator: "9mobile", name: "9mobile ₦500 Airtime",  variation_code: "9mobile-airtime-500",  amount: 500  },
    { id: randomUUID(), service_id: id["9mobile-airtime"], provider_code: PROVIDER, network_operator: "9mobile", name: "9mobile ₦1000 Airtime", variation_code: "9mobile-airtime-1000", amount: 1000 },

    // ── DStv ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, network_operator: "dstv", name: "DStv Padi",          variation_code: "dstv-padi",          amount: 1850  },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, network_operator: "dstv", name: "DStv Yanga",         variation_code: "dstv-yanga",         amount: 2565  },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, network_operator: "dstv", name: "DStv Confam",        variation_code: "dstv-confam",        amount: 3310  },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, network_operator: "dstv", name: "DStv Compact",       variation_code: "dstv-compact",       amount: 9000  },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, network_operator: "dstv", name: "DStv Compact Plus",  variation_code: "dstv-compact-plus",  amount: 14250 },
    { id: randomUUID(), service_id: id["dstv"], provider_code: PROVIDER, network_operator: "dstv", name: "DStv Premium",       variation_code: "dstv-premium",       amount: 24750 },

    // ── GOtv ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, network_operator: "gotv", name: "GOtv Smallie", variation_code: "gotv-smallie", amount: 900  },
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, network_operator: "gotv", name: "GOtv Jolli",   variation_code: "gotv-jolli",   amount: 2460 },
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, network_operator: "gotv", name: "GOtv Max",     variation_code: "gotv-max",     amount: 4150 },
    { id: randomUUID(), service_id: id["gotv"], provider_code: PROVIDER, network_operator: "gotv", name: "GOtv Supa",    variation_code: "gotv-supa",    amount: 6400 },

    // ── StarTimes ─────────────────────────────────────────────
    { id: randomUUID(), service_id: id["startimes"], provider_code: PROVIDER, network_operator: "startimes", name: "StarTimes Nova",  variation_code: "startimes-nova",  amount: 900  },
    { id: randomUUID(), service_id: id["startimes"], provider_code: PROVIDER, network_operator: "startimes", name: "StarTimes Basic", variation_code: "startimes-basic", amount: 1700 },
    { id: randomUUID(), service_id: id["startimes"], provider_code: PROVIDER, network_operator: "startimes", name: "StarTimes Smart", variation_code: "startimes-smart", amount: 2200 },

    // ── WAEC ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["waec"], provider_code: PROVIDER, network_operator: "waec", name: "WAEC Result Checker", variation_code: "waec-result-checker", amount: 1050 },
    { id: randomUUID(), service_id: id["waec"], provider_code: PROVIDER, network_operator: "waec", name: "WAEC Scratch Card",   variation_code: "waec-scratch-card",   amount: 4050 },

    // ── NECO ──────────────────────────────────────────────────
    { id: randomUUID(), service_id: id["neco"], provider_code: PROVIDER, network_operator: "neco", name: "NECO Result Checker", variation_code: "neco-result-checker", amount: 750  },
    { id: randomUUID(), service_id: id["neco"], provider_code: PROVIDER, network_operator: "neco", name: "NECO Scratch Card",   variation_code: "neco-scratch-card",   amount: 1200 },

    // ── Electricity — generic (variable amount, no disco operator) ─────────
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

    // ── EKEDC (Eko Electricity) ───────────────────────────────
    { id: randomUUID(), service_id: id["ekedc"], provider_code: PROVIDER, network_operator: "ekedc", name: "EKEDC Prepaid",  variation_code: "ekedc-prepaid",  amount: 0, is_variable_amount: true },
    { id: randomUUID(), service_id: id["ekedc"], provider_code: PROVIDER, network_operator: "ekedc", name: "EKEDC Postpaid", variation_code: "ekedc-postpaid", amount: 0, is_variable_amount: true },

    // ── IKEDC (Ikeja Electricity) ─────────────────────────────
    { id: randomUUID(), service_id: id["ikedc"], provider_code: PROVIDER, network_operator: "ikedc", name: "IKEDC Prepaid",  variation_code: "ikedc-prepaid",  amount: 0, is_variable_amount: true },
    { id: randomUUID(), service_id: id["ikedc"], provider_code: PROVIDER, network_operator: "ikedc", name: "IKEDC Postpaid", variation_code: "ikedc-postpaid", amount: 0, is_variable_amount: true },

    // ── AEDC (Abuja Electricity) ──────────────────────────────
    { id: randomUUID(), service_id: id["aedc"], provider_code: PROVIDER, network_operator: "aedc", name: "AEDC Prepaid",  variation_code: "aedc-prepaid",  amount: 0, is_variable_amount: true },
    { id: randomUUID(), service_id: id["aedc"], provider_code: PROVIDER, network_operator: "aedc", name: "AEDC Postpaid", variation_code: "aedc-postpaid", amount: 0, is_variable_amount: true },

    // ── PHED (Port Harcourt Electricity) ──────────────────────
    { id: randomUUID(), service_id: id["phed"], provider_code: PROVIDER, network_operator: "phed", name: "PHED Prepaid",  variation_code: "phed-prepaid",  amount: 0, is_variable_amount: true },
    { id: randomUUID(), service_id: id["phed"], provider_code: PROVIDER, network_operator: "phed", name: "PHED Postpaid", variation_code: "phed-postpaid", amount: 0, is_variable_amount: true },

    // ── KEDCO (Kaduna Electricity) ────────────────────────────
    { id: randomUUID(), service_id: id["kedco"], provider_code: PROVIDER, network_operator: "kedco", name: "KEDCO Prepaid",  variation_code: "kedco-prepaid",  amount: 0, is_variable_amount: true },
    { id: randomUUID(), service_id: id["kedco"], provider_code: PROVIDER, network_operator: "kedco", name: "KEDCO Postpaid", variation_code: "kedco-postpaid", amount: 0, is_variable_amount: true },

    // ── Identity Verification ─────────────────────────────────
    { id: randomUUID(), service_id: id["nin-verification"], provider_code: PROVIDER, network_operator: "nin", name: "NIN Lookup", variation_code: "nin", amount: 150 },
    { id: randomUUID(), service_id: id["bvn-verification"], provider_code: PROVIDER, network_operator: "bvn", name: "BVN Lookup", variation_code: "bvn", amount: 150 },
  ];

  await knex("service_plans")
    .insert(plans)
    .onConflict(["service_id", "variation_code"])
    .ignore();
}
