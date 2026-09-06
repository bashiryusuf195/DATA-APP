import { HttpVTUProvider } from "./http-vtu.provider";
import type {
  ProviderPurchaseInput,
  ProviderPurchaseResult,
  VerifyTransactionResult,
  ProviderBalance,
  ProviderHealthResult,
  MeterVerifyInput,
  MeterVerifyResult,
  CableVerifyInput,
  CableVerifyResult,
} from "../types/provider.types";
import { getProviderCredentials } from "./provider-credentials.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const EDATA_TIMEOUT_MS = 30_000;

// ── Plan lists ────────────────────────────────────────────────────────────────
//
// eData does not expose a plan-list API endpoint.
// Plans are sourced from their dashboard docs and stored here.
const DATA_PLAN_LIST: Array<Record<string, unknown>> = [
  // ── MTN SME ──────────────────────────────────────────────────────────────────
  { id:  1, network: "mtn", plan_type: "SME",     plan: "1GB 7DAYS",   amount:   400, month_validate: "7 days"  },
  { id:  2, network: "mtn", plan_type: "SME",     plan: "2GB 30DAYS",  amount:   850, month_validate: "30 days" },
  { id:  3, network: "mtn", plan_type: "SME",     plan: "5GB 30DAYS",  amount:  1700, month_validate: "30 days" },
  { id: 29, network: "mtn", plan_type: "SME",     plan: "500MB 7DAYS", amount:   250, month_validate: "7 days"  },
  { id: 30, network: "mtn", plan_type: "SME",     plan: "1GB 30DAYS",  amount:   500, month_validate: "30 days" },
  { id: 31, network: "mtn", plan_type: "SME",     plan: "3GB 30DAYS",  amount:  1250, month_validate: "30 days" },
  // ── MTN GIFTING ──────────────────────────────────────────────────────────────
  { id: 32, network: "mtn", plan_type: "GIFTING", plan: "500MB 1DAY",   amount:   340, month_validate: "1 days"  },
  { id: 33, network: "mtn", plan_type: "GIFTING", plan: "500MB 7DAYS",  amount:   485, month_validate: "7 days"  },
  { id: 34, network: "mtn", plan_type: "GIFTING", plan: "750MB 2DAYS",  amount:   437, month_validate: "2 days"  },
  { id: 36, network: "mtn", plan_type: "GIFTING", plan: "1GB 1DAY",     amount:   485, month_validate: "7 days"  },
  { id: 37, network: "mtn", plan_type: "GIFTING", plan: "1GB 7DAYS",    amount:   776, month_validate: "7 days"  },
  { id: 38, network: "mtn", plan_type: "GIFTING", plan: "1.2GB 7DAYS",  amount:   728, month_validate: "7 days"  },
  { id: 39, network: "mtn", plan_type: "GIFTING", plan: "1.5GB 2DAYS",  amount:   582, month_validate: "1 days"  },
  { id: 40, network: "mtn", plan_type: "GIFTING", plan: "1.5GB 7DAYS",  amount:   970, month_validate: "7 days"  },
  { id: 41, network: "mtn", plan_type: "GIFTING", plan: "2.5GB 1DAY",   amount:   730, month_validate: "1 days"  },
  { id: 42, network: "mtn", plan_type: "GIFTING", plan: "2.5GB 2DAYS",  amount:   873, month_validate: "2 days"  },
  { id: 44, network: "mtn", plan_type: "GIFTING", plan: "3.2GB 2DAYS",  amount:   970, month_validate: "2 days"  },
  { id: 46, network: "mtn", plan_type: "GIFTING", plan: "3.5GB 2DAYS",  amount:  2425, month_validate: "30 days" },
  { id: 47, network: "mtn", plan_type: "GIFTING", plan: "4GB 2DAYS",    amount:  1164, month_validate: "2 days"  },
  { id: 48, network: "mtn", plan_type: "GIFTING", plan: "5.5GB 2DAYS",  amount:  1455, month_validate: "2 days"  },
  { id: 49, network: "mtn", plan_type: "GIFTING", plan: "6GB 7DAYS",    amount:  2425, month_validate: "7 days"  },
  { id: 50, network: "mtn", plan_type: "GIFTING", plan: "7GB 2DAYS",    amount:  1746, month_validate: "2 days"  },
  { id: 51, network: "mtn", plan_type: "GIFTING", plan: "7GB 30DAYS",   amount:  3395, month_validate: "30 days" },
  { id: 52, network: "mtn", plan_type: "GIFTING", plan: "10GB 30DAYS",  amount:  4365, month_validate: "30 days" },
  { id: 53, network: "mtn", plan_type: "GIFTING", plan: "11GB 7DAYS",   amount:  3395, month_validate: "7 days"  },
  { id: 54, network: "mtn", plan_type: "GIFTING", plan: "12.5GB 30DAYS",amount:  5335, month_validate: "30 days" },
  { id: 55, network: "mtn", plan_type: "GIFTING", plan: "16.5GB 2DAYS", amount:  6305, month_validate: "30 days" },
  { id: 56, network: "mtn", plan_type: "GIFTING", plan: "20GB 7DAYS",   amount:  4850, month_validate: "7 days"  },
  { id: 57, network: "mtn", plan_type: "GIFTING", plan: "20GB 30DAYS",  amount:  7275, month_validate: "30 days" },
  { id: 58, network: "mtn", plan_type: "GIFTING", plan: "25GB 30DAYS",  amount:  9215, month_validate: "30 days" },
  { id: 59, network: "mtn", plan_type: "GIFTING", plan: "36GB 30DAYS",  amount: 10670, month_validate: "30 days" },
  { id: 60, network: "mtn", plan_type: "GIFTING", plan: "65GB 30DAYS",  amount: 15520, month_validate: "30 days" },
  // ── MTN AWOOF ────────────────────────────────────────────────────────────────
  { id: 104, network: "mtn", plan_type: "AWOOF", plan: "1GB Daily Plan",   amount:   260, month_validate: "1 days"  },
  { id: 113, network: "mtn", plan_type: "AWOOF", plan: "2.5GB Daily Plan", amount:   570, month_validate: "1 days"  },
  { id: 119, network: "mtn", plan_type: "AWOOF", plan: "5GB 14DAYS",       amount:  1200, month_validate: "14 days" },
  // ── MTN SME 2 ────────────────────────────────────────────────────────────────
  { id: 150, network: "mtn", plan_type: "SME 2", plan: "1GB 30 Days",  amount:   230, month_validate: "30 days" },
  { id: 159, network: "mtn", plan_type: "SME 2", plan: "5GB 30DAYS",   amount:  1100, month_validate: "30 days" },

  // ── AIRTEL GIFTING ───────────────────────────────────────────────────────────
  { id: 61, network: "airtel", plan_type: "GIFTING", plan: "110MB Daily Plan",  amount:    97, month_validate: "1 days"  },
  { id: 62, network: "airtel", plan_type: "GIFTING", plan: "230MB 2-Days Plan", amount:   195, month_validate: "2 days"  },
  { id: 63, network: "airtel", plan_type: "GIFTING", plan: "300MB 2-Days Plan", amount:   291, month_validate: "2 days"  },
  { id: 64, network: "airtel", plan_type: "GIFTING", plan: "500MB 1-Day Plan",  amount:  3350, month_validate: "1 days"  },
  { id: 65, network: "airtel", plan_type: "GIFTING", plan: "500MB Weekly Plan", amount:   486, month_validate: "7 days"  },
  { id: 66, network: "airtel", plan_type: "GIFTING", plan: "1GB Weekly Plan",   amount:   776, month_validate: "7 days"  },
  { id: 67, network: "airtel", plan_type: "GIFTING", plan: "1.5GB Weekly Plan", amount:   970, month_validate: "7 days"  },
  { id: 68, network: "airtel", plan_type: "GIFTING", plan: "5GB Weekly Plan",   amount:  1455, month_validate: "5 days"  },
  { id: 69, network: "airtel", plan_type: "GIFTING", plan: "6GB Weekly Plan",   amount:  2425, month_validate: "6 days"  },
  { id: 70, network: "airtel", plan_type: "GIFTING", plan: "10GB Weekly Plan",  amount:  2910, month_validate: "7 days"  },
  { id: 71, network: "airtel", plan_type: "GIFTING", plan: "18GB Weekly Plan",  amount:  4850, month_validate: "7 days"  },
  { id: 72, network: "airtel", plan_type: "GIFTING", plan: "2GB Monthly + Bonus 2GB + 200MB",  amount:  1455, month_validate: "30 days" },
  { id: 73, network: "airtel", plan_type: "GIFTING", plan: "3GB Monthly + Bonus 2GB + 200MB",  amount:  1940, month_validate: "30 days" },
  { id: 74, network: "airtel", plan_type: "GIFTING", plan: "4GB Monthly + Bonus 2GB + 200MB",  amount:  2425, month_validate: "30 days" },
  { id: 75, network: "airtel", plan_type: "GIFTING", plan: "8GB Monthly + BONUS 2GB + 200MB",  amount:  2910, month_validate: "30 days" },
  { id: 76, network: "airtel", plan_type: "GIFTING", plan: "10GB Monthly + BONUS 2GB + 200MB", amount:  3880, month_validate: "30 days" },
  { id: 77, network: "airtel", plan_type: "GIFTING", plan: "13GB Monthly + BONUS 2GB + 200MB", amount:  4850, month_validate: "30 days" },
  { id: 78, network: "airtel", plan_type: "GIFTING", plan: "18GB Monthly + BONUS 2GB + 200MB", amount:  5820, month_validate: "30 days" },
  { id: 79, network: "airtel", plan_type: "GIFTING", plan: "25GB Monthly + BONUS 2GB + 200MB", amount:  7760, month_validate: "30 days" },
  { id: 80, network: "airtel", plan_type: "GIFTING", plan: "35GB Monthly + BONUS 2GB + 200MB", amount:  9700, month_validate: "30 days" },
  // ── AIRTEL SME ───────────────────────────────────────────────────────────────
  { id: 138, network: "airtel", plan_type: "SME", plan: "1.5GB 1Day [Awoof]",     amount:   390, month_validate: "1 days"  },
  { id: 139, network: "airtel", plan_type: "SME", plan: "200MB 2Days [Social]",   amount:   100, month_validate: "1 days"  },
  { id: 140, network: "airtel", plan_type: "SME", plan: "300MB 2Days [Awoof]",    amount:   100, month_validate: "1 days"  },
  { id: 142, network: "airtel", plan_type: "SME", plan: "2GB 2Days (Binge)",      amount:   585, month_validate: "2 days"  },
  { id: 143, network: "airtel", plan_type: "SME", plan: "1GB 3Days [Social]",     amount:   295, month_validate: "3 days"  },
  { id: 144, network: "airtel", plan_type: "SME", plan: "1.5GB 7Days [Social]",   amount:   485, month_validate: "7 days"  },
  { id: 145, network: "airtel", plan_type: "SME", plan: "7GB Weekly Awoof",       amount:  1950, month_validate: "7 days"  },
  { id: 147, network: "airtel", plan_type: "SME", plan: "13GB Monthly Plan (awoof)", amount: 4850, month_validate: "30 days" },
  { id: 148, network: "airtel", plan_type: "SME", plan: "350GB 6 Months (Gifting)",  amount: 58500, month_validate: "120 days" },
  { id: 149, network: "airtel", plan_type: "SME", plan: "650 Yearly Plan (Gifting)", amount: 97000, month_validate: "365 days" },

  // ── GLO CORPORATE ────────────────────────────────────────────────────────────
  { id: 81, network: "glo", plan_type: "CORPORATE", plan: "1GB 3DAYS",  amount:   360, month_validate: "3 days"  },
  { id: 82, network: "glo", plan_type: "CORPORATE", plan: "1GB 7DAYS",  amount:   380, month_validate: "7 days"  },
  { id: 83, network: "glo", plan_type: "CORPORATE", plan: "3GB 3DAYS",  amount:  1100, month_validate: "3 days"  },
  { id: 84, network: "glo", plan_type: "CORPORATE", plan: "3GB 7DAYS",  amount:  1100, month_validate: "7 days"  },
  { id: 85, network: "glo", plan_type: "CORPORATE", plan: "5GB 3DAYS",  amount:  1750, month_validate: "3 days"  },
  { id: 86, network: "glo", plan_type: "CORPORATE", plan: "5GB 7DAYS",  amount:  1800, month_validate: "7 days"  },
  { id: 152, network: "glo", plan_type: "CORPORATE", plan: "200MB",     amount:    90, month_validate: "14 days" },
  { id: 153, network: "glo", plan_type: "CORPORATE", plan: "500MB",     amount:   220, month_validate: "30 days" },
  { id: 154, network: "glo", plan_type: "CORPORATE", plan: "1GB Night", amount:   355, month_validate: "14 days" },
  { id: 155, network: "glo", plan_type: "CORPORATE", plan: "1GB 30DAYS",amount:   450, month_validate: "30 days" },
  { id: 156, network: "glo", plan_type: "CORPORATE", plan: "3GB 30DAYS",amount:  1250, month_validate: "30 days" },
  { id: 157, network: "glo", plan_type: "CORPORATE", plan: "5GB 30DAYS",amount:  2100, month_validate: "30 days" },
  { id: 158, network: "glo", plan_type: "CORPORATE", plan: "10GB",      amount:  4100, month_validate: "30 days" },
  // ── GLO GIFTING ──────────────────────────────────────────────────────────────
  { id: 114, network: "glo", plan_type: "GIFTING", plan: "500MB Night 1DAY",  amount:    50, month_validate: "1 days"  },
  { id: 116, network: "glo", plan_type: "GIFTING", plan: "1GB Night",         amount:   100, month_validate: "1 days"  },
  { id: 117, network: "glo", plan_type: "GIFTING", plan: "1.5GB Weekly Plan", amount:   500, month_validate: "7 days"  },
  { id: 120, network: "glo", plan_type: "GIFTING", plan: "2.6GB 30DAYS",      amount:   960, month_validate: "30 days" },
  { id: 121, network: "glo", plan_type: "GIFTING", plan: "6GB SPECIAL 7DAYS", amount:  1450, month_validate: "7 days"  },
  { id: 122, network: "glo", plan_type: "GIFTING", plan: "5GB 30DAYS",        amount:  1450, month_validate: "30 days" },
  { id: 123, network: "glo", plan_type: "GIFTING", plan: "4.25GB 30DAYS",     amount:  1400, month_validate: "30 days" },
  { id: 124, network: "glo", plan_type: "GIFTING", plan: "7.5GB 30DAYS",      amount:  2400, month_validate: "30 days" },
  { id: 125, network: "glo", plan_type: "GIFTING", plan: "11GB 30DAYS",       amount:  2900, month_validate: "30 days" },
  { id: 126, network: "glo", plan_type: "GIFTING", plan: "14GB 30DAYS",       amount:  3850, month_validate: "30 days" },
  { id: 127, network: "glo", plan_type: "GIFTING", plan: "18GB 30DAYS",       amount:  4800, month_validate: "30 days" },
  { id: 128, network: "glo", plan_type: "GIFTING", plan: "29GB 30DAYS",       amount:  7600, month_validate: "30 days" },
  { id: 129, network: "glo", plan_type: "GIFTING", plan: "40GB 30DAYS",       amount:  9500, month_validate: "30 days" },
  { id: 130, network: "glo", plan_type: "GIFTING", plan: "69GB 30DAYS",       amount: 14500, month_validate: "30 days" },
  { id: 131, network: "glo", plan_type: "GIFTING", plan: "110GB 30DAYS",      amount: 18900, month_validate: "30 days" },

  // ── TALKMORE (9mobile-based MVNO, appears on eData's plan list) ─────────────
  { id: 93,  network: "9mobile", plan_type: "TALKMORE", plan: "400 AIRTIME",   amount:   130, month_validate: "7 days"  },
  { id: 94,  network: "9mobile", plan_type: "TALKMORE", plan: "800 AIRTIME",   amount:   230, month_validate: "7 days"  },
  { id: 95,  network: "9mobile", plan_type: "TALKMORE", plan: "1000 AIRTIME",  amount:     0, month_validate: "7 days"  },
  { id: 96,  network: "9mobile", plan_type: "TALKMORE", plan: "1200 AIRTIME",  amount:   350, month_validate: "7 days"  },
  { id: 97,  network: "9mobile", plan_type: "TALKMORE", plan: "2000 AIRTIME",  amount:   600, month_validate: "7 days"  },
  { id: 98,  network: "9mobile", plan_type: "TALKMORE", plan: "4000 AIRTIME",  amount:  1200, month_validate: "14 days" },
  { id: 99,  network: "9mobile", plan_type: "TALKMORE", plan: "4800 AIRTIME",  amount:  1400, month_validate: "14 days" },
  { id: 100, network: "9mobile", plan_type: "TALKMORE", plan: "6000 AIRTIME",  amount:  1700, month_validate: "14 days" },
  { id: 101, network: "9mobile", plan_type: "TALKMORE", plan: "8000 AIRTIME",  amount:  2200, month_validate: "14 days" },
  { id: 102, network: "9mobile", plan_type: "TALKMORE", plan: "10000 AIRTIME", amount:  2700, month_validate: "14 days" },
  { id: 87,  network: "9mobile", plan_type: "TALKMORE", plan: "10 MINUTES",    amount:   100, month_validate: "3 days"  },
  { id: 88,  network: "9mobile", plan_type: "TALKMORE", plan: "20 MINUTES",    amount:   200, month_validate: "7 days"  },
  { id: 89,  network: "9mobile", plan_type: "TALKMORE", plan: "30 MINUTES",    amount:   300, month_validate: "7 days"  },
  { id: 90,  network: "9mobile", plan_type: "TALKMORE", plan: "50 MINUTES",    amount:   500, month_validate: "30 days" },
  { id: 91,  network: "9mobile", plan_type: "TALKMORE", plan: "150 MINUTES",   amount:  1500, month_validate: "30 days" },
  { id: 92,  network: "9mobile", plan_type: "TALKMORE", plan: "100 MINUTES",   amount:  1000, month_validate: "30 days" },
];

// plan_code is the numeric ID as a string — matches SMShika's cable plan_code convention
// (both use the same underlying IDs 1-14, but keep this list separate per-provider —
// never assume shared IDs will always stay aligned between providers).
const CABLE_TV_PLAN_LIST: Array<Record<string, unknown>> = [
  { plan_code: "1",  name: "DStv Compact",      operator: "dstv",      amount:  8500 },
  { plan_code: "2",  name: "DStv Compact Plus",  operator: "dstv",      amount: 13500 },
  { plan_code: "3",  name: "DStv Premium",       operator: "dstv",      amount: 26500 },
  { plan_code: "4",  name: "DStv Confam",        operator: "dstv",      amount:  6500 },
  { plan_code: "5",  name: "GOtv Smallie",       operator: "gotv",      amount:  1500 },
  { plan_code: "6",  name: "GOtv Jinja",         operator: "gotv",      amount:  2900 },
  { plan_code: "7",  name: "GOtv Jolli",         operator: "gotv",      amount:  4200 },
  { plan_code: "8",  name: "GOtv Max",           operator: "gotv",      amount:  5500 },
  { plan_code: "9",  name: "StarTimes Nova",     operator: "startimes", amount:  1500 },
  { plan_code: "10", name: "StarTimes Basic",    operator: "startimes", amount:  2900 },
  { plan_code: "11", name: "StarTimes Smart",    operator: "startimes", amount:  4200 },
  { plan_code: "12", name: "StarTimes Classic",  operator: "startimes", amount:  5500 },
  { plan_code: "13", name: "ShowMax Mobile",     operator: "showmax",   amount:  1500 },
  { plan_code: "14", name: "ShowMax Pro",        operator: "showmax",   amount:  2900 },
];

// eData DISCO list — provider_code is LOWERCASE per their docs
// (differs from SMShika, which uses UPPERCASE codes like AEDC, IKEDC).
// Each DISCO offers prepaid and postpaid. Amounts are 0 (variable at purchase).
const ELECTRICITY_DISCO_LIST: Array<Record<string, unknown>> = [
  { plan_code: "aedc-prepaid",   name: "AEDC Prepaid",   operator: "aedc",   plan_category: "prepaid",  provider_code: "aedc"   },
  { plan_code: "aedc-postpaid",  name: "AEDC Postpaid",  operator: "aedc",   plan_category: "postpaid", provider_code: "aedc"   },
  { plan_code: "bedc-prepaid",   name: "BEDC Prepaid",   operator: "bedc",   plan_category: "prepaid",  provider_code: "bedc"   },
  { plan_code: "bedc-postpaid",  name: "BEDC Postpaid",  operator: "bedc",   plan_category: "postpaid", provider_code: "bedc"   },
  { plan_code: "ekedc-prepaid",  name: "EKEDC Prepaid",  operator: "ekedc",  plan_category: "prepaid",  provider_code: "ekedc"  },
  { plan_code: "ekedc-postpaid", name: "EKEDC Postpaid", operator: "ekedc",  plan_category: "postpaid", provider_code: "ekedc"  },
  { plan_code: "eedc-prepaid",   name: "EEDC Prepaid",   operator: "eedc",   plan_category: "prepaid",  provider_code: "eedc"   },
  { plan_code: "eedc-postpaid",  name: "EEDC Postpaid",  operator: "eedc",   plan_category: "postpaid", provider_code: "eedc"   },
  { plan_code: "ibedc-prepaid",  name: "IBEDC Prepaid",  operator: "ibedc",  plan_category: "prepaid",  provider_code: "ibedc"  },
  { plan_code: "ibedc-postpaid", name: "IBEDC Postpaid", operator: "ibedc",  plan_category: "postpaid", provider_code: "ibedc"  },
  { plan_code: "ikedc-prepaid",  name: "IKEDC Prepaid",  operator: "ikedc",  plan_category: "prepaid",  provider_code: "ikedc"  },
  { plan_code: "ikedc-postpaid", name: "IKEDC Postpaid", operator: "ikedc",  plan_category: "postpaid", provider_code: "ikedc"  },
  { plan_code: "jedc-prepaid",   name: "JEDC Prepaid",   operator: "jedc",   plan_category: "prepaid",  provider_code: "jedc"   },
  { plan_code: "jedc-postpaid",  name: "JEDC Postpaid",  operator: "jedc",   plan_category: "postpaid", provider_code: "jedc"   },
  { plan_code: "kaedco-prepaid", name: "KAEDCO Prepaid", operator: "kaedco", plan_category: "prepaid",  provider_code: "kaedco" },
  { plan_code: "kaedco-postpaid",name: "KAEDCO Postpaid",operator: "kaedco", plan_category: "postpaid", provider_code: "kaedco" },
  { plan_code: "kedco-prepaid",  name: "KEDCO Prepaid",  operator: "kedco",  plan_category: "prepaid",  provider_code: "kedco"  },
  { plan_code: "kedco-postpaid", name: "KEDCO Postpaid", operator: "kedco",  plan_category: "postpaid", provider_code: "kedco"  },
  { plan_code: "phed-prepaid",   name: "PHED Prepaid",   operator: "phed",   plan_category: "prepaid",  provider_code: "phed"   },
  { plan_code: "phed-postpaid",  name: "PHED Postpaid",  operator: "phed",   plan_category: "postpaid", provider_code: "phed"   },
  { plan_code: "yedc-prepaid",   name: "YEDC Prepaid",   operator: "yedc",   plan_category: "prepaid",  provider_code: "yedc"   },
  { plan_code: "yedc-postpaid",  name: "YEDC Postpaid",  operator: "yedc",   plan_category: "postpaid", provider_code: "yedc"   },
];

// ── Operator mapping ──────────────────────────────────────────────────────────

const AIRTIME_NETWORK_MAP: Record<string, string> = {
  mtn:       "MTN",
  airtel:    "Airtel",
  glo:       "Glo",
  "9mobile": "9mobile",
  etisalat:  "9mobile",
};

// eData data API network IDs (documented at /api/data/ endpoint — same
// numbering as SMShika, but keep separate: never assume providers stay aligned):
//   1 = MTN  |  2 = Glo  |  3 = 9mobile  |  4 = Airtel
const DATA_NETWORK_ID_MAP: Record<string, number> = {
  mtn:       1,
  glo:       2,
  "9mobile": 3,
  etisalat:  3,
  airtel:    4,
};

// ── eData response shapes ─────────────────────────────────────────────────────
// Identical shape to SMShika — same underlying platform ("HK VTU Platform").

interface EdataTopupResponse {
  Status?:        string;
  status?:        string;
  message?:       string;
  api_response?:  { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

interface EdataMeterVerifyResponse {
  Status?:  string;
  status?:  string;
  success?: boolean;
  message?: string;
  data?: {
    customer_name?:    string;
    customer_address?: string;
    tariff_class?:     string;
  };
}

interface EdataElectricityResponse {
  Status?:        string;
  status?:        string;
  message?:       string;
  token?:         string;
  units?:         string | number;
  api_response?:  { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

interface EdataCableVerifyResponse {
  success?: boolean;
  message?: string;
  data?: {
    customer_name?:   string;
    customer_number?: string;
  };
}

interface EdataCablePurchaseResponse {
  Status?:        string;
  status?:        string;
  message?:       string;
  api_response?:  string | null;
  balance_before?: string;
  balance_after?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPrefix(variationCode: string): string {
  return variationCode.split("-")[0].toLowerCase();
}

function resolveAirtimeNetwork(variationCode: string): string | null {
  return AIRTIME_NETWORK_MAP[extractPrefix(variationCode)] ?? null;
}

function resolveDataNetworkId(variationCode: string): number | null {
  const id = DATA_NETWORK_ID_MAP[extractPrefix(variationCode)];
  return id !== undefined ? id : null;
}

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 5) return "***";
  return `${phone.slice(0, 5)}${"*".repeat(phone.length - 5)}`;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class EdataProvider extends HttpVTUProvider {
  readonly name = "edata";

  constructor() {
    super("edata");
  }

  // ── HTTP primitives ───────────────────────────────────────────────────────

  private async fetchWithTimeout(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    },
    timeoutMs = EDATA_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method:  init.method,
        headers: init.headers,
        body:    init.body,
        signal:  controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`eData request timed out after ${timeoutMs}ms [${url}]`);
      }
      throw new Error(`eData network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`eData: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `eData: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(0, 200)}`
      );
    }
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    const creds = await this.requireCredentials();

    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey) {
      throw new Error("eData: api_key not set — add it in Admin > API Integrations > eData");
    }
    if (!baseUrl) {
      throw new Error("eData: base_url not set — add it in Admin > API Integrations > eData");
    }

    if (input.service_type === "airtime") {
      return this.purchaseAirtime(input, apiKey, baseUrl);
    }
    if (input.service_type === "data") {
      return this.purchaseData(input, apiKey, baseUrl);
    }
    if (input.service_type === "electricity") {
      return this.purchaseElectricity(input, apiKey, baseUrl);
    }
    if (input.service_type === "cable_tv") {
      return this.purchaseCable(input, apiKey, baseUrl);
    }

    throw new Error(
      `eData: service_type '${input.service_type}' not implemented. ` +
      `Supported: airtime, data, electricity, cable_tv.`
    );
  }

  // ── Airtime ───────────────────────────────────────────────────────────────

  private async purchaseAirtime(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const variationCode = input.variation_code ?? "";
    const network = resolveAirtimeNetwork(variationCode);

    if (!network) {
      throw new Error(
        `eData airtime: cannot resolve network for variation_code '${variationCode}'. ` +
        `Expected prefix: mtn | airtel | glo | 9mobile`
      );
    }

    const payload = {
      amount:        String(input.amount),
      network,
      mobile_number: input.phone ?? "",
      Ported_number: false,
      airtime_type:  "VTU",
    };

    console.log("[EDATA] airtime purchase →", {
      network,
      amount:    input.amount,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/topup`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`eData airtime: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<EdataTopupResponse>(response, "airtime topup");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[EDATA] airtime purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message, reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Airtime purchase successful" : "Airtime purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       {
        status: raw.status, Status: raw.Status, message: raw.message,
        api_response: raw.api_response, balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  private async purchaseData(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const rawPlanId = input.provider_variation_code ?? null;
    if (!rawPlanId) {
      throw new Error(
        "eData data: Provider plan ID is missing for this plan. " +
        "Go to Admin → Service Plans, find this data plan, and set " +
        "'Provider Variation Code' to the numeric plan ID from your eData plan list."
      );
    }
    const planId = parseInt(rawPlanId, 10);
    if (isNaN(planId) || planId <= 0) {
      throw new Error(
        `eData data: Provider plan ID '${rawPlanId}' is not a valid positive integer. ` +
        "Update the plan in Admin → Service Plans with the correct numeric eData plan ID."
      );
    }

    const variationCode = input.variation_code ?? "";
    const networkId = resolveDataNetworkId(variationCode);
    if (networkId === null) {
      throw new Error(
        `eData data: cannot resolve network ID for variation_code '${variationCode}'. ` +
        `Expected prefix: mtn | glo | 9mobile | airtel`
      );
    }

    const payload = {
      network:       networkId,
      mobile_number: input.phone ?? "",
      plan:          planId,
      Ported_number: false,
    };

    console.log("[EDATA] data purchase →", {
      network: networkId, plan: planId, amount: input.amount, phone: maskPhone(input.phone), reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/data/`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`eData data: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<EdataTopupResponse>(response, "data purchase");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[EDATA] data purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message, reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Data purchase successful" : "Data purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       {
        status: raw.status, Status: raw.Status, message: raw.message,
        api_response: raw.api_response, balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Electricity ───────────────────────────────────────────────────────────

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("eData: api_key not set — add it in Admin > API Integrations > eData");
    if (!baseUrl) throw new Error("eData: base_url not set — add it in Admin > API Integrations > eData");

    if (!input.disco_name) {
      throw new Error(
        "eData electricity: disco_name (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the eData disco code (lowercase, e.g. ikedc)."
      );
    }

    // eData requires LOWERCASE provider_code — normalize defensively.
    const providerCode = input.disco_name.toLowerCase();

    const payload = {
      provider_code: providerCode,
      meter_number:  input.meter_number,
      meter_type:    input.meter_type,
    };

    console.log("[EDATA] meter verify →", {
      provider_code: providerCode, meter_type: input.meter_type, meter: maskPhone(input.meter_number),
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/electricity/verify`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`eData meter verify: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<EdataMeterVerifyResponse>(response, "meter verify");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = raw.success === true || SUCCESS_VALUES.has(rawStatusLower);

    const customerName = raw.data?.customer_name ?? "";
    const address       = raw.data?.customer_address;

    console.log("[EDATA] meter verify ←", {
      status: raw.status, success: raw.success, customer_name: customerName, message: raw.message,
    });

    if (!isSuccess) {
      return {
        success: false, customer_name: "", meter_number: input.meter_number,
        message: raw.message ?? "Meter verification failed", raw_response: raw,
      };
    }

    return {
      success: true, customer_name: customerName, address,
      meter_number: input.meter_number, message: raw.message ?? "Meter verified successfully", raw_response: raw,
    };
  }

  private async purchaseElectricity(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const discoName = input.provider_variation_code ?? null;
    if (!discoName) {
      throw new Error(
        "eData electricity: disco_name (Provider Variation Code) is missing for this plan. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the eData disco code (lowercase, e.g. ikedc)."
      );
    }

    const meterType = input.plan_category ?? "prepaid";
    const providerCode = discoName.toLowerCase();

    const payload = {
      provider_code: providerCode,
      meter_number:  input.meter_number ?? "",
      meter_type:    meterType,
      amount:        input.amount,
      phone:         input.phone ?? "",
    };

    console.log("[EDATA] electricity purchase →", {
      provider_code: providerCode, meter_type: meterType, amount: input.amount,
      meter: maskPhone(input.meter_number), reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/electricity/`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`eData electricity: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<EdataElectricityResponse>(response, "electricity purchase");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[EDATA] electricity purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message,
      token: raw.token ? "[present]" : "[absent]", reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Electricity purchase successful" : "Electricity purchase failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       {
        status: raw.status, Status: raw.Status, message: raw.message, token: raw.token, units: raw.units,
        api_response: raw.api_response, balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Cable TV ──────────────────────────────────────────────────────────────

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    const creds = await this.requireCredentials();
    const apiKey  = creds.api_key_encrypted;
    const baseUrl = creds.base_url;

    if (!apiKey)  throw new Error("eData: api_key not set — add it in Admin > API Integrations > eData");
    if (!baseUrl) throw new Error("eData: base_url not set — add it in Admin > API Integrations > eData");

    if (!input.biller_code) {
      throw new Error(
        "eData cable: biller_code is missing. " +
        "Ensure the plan has a network_operator set (e.g. dstv, gotv, startimes)."
      );
    }

    const payload = {
      smartcard: input.smartcard_number,
      provider:  input.biller_code.toUpperCase(),
    };

    console.log("[EDATA] cable verify →", {
      biller: input.biller_code, smartcard: maskPhone(input.smartcard_number),
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/cable/verify`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`eData cable verify: HTTP ${response.status} authentication failure — verify api_key`);
    }

    // Note: eData's success response omits Current_Bouquet/Due_Date fields
    // (unlike SMShika) — only customer_name and customer_number are returned.
    const raw = await this.parseJson<EdataCableVerifyResponse>(response, "cable verify");

    const isSuccess = raw.success === true;

    console.log("[EDATA] cable verify ←", {
      success: raw.success, customer_name: raw.data?.customer_name, message: raw.message,
    });

    if (!isSuccess) {
      return { success: false, message: raw.message ?? "Decoder verification failed", raw_response: raw };
    }

    return {
      success:          true,
      customer_name:    raw.data?.customer_name ?? undefined,
      smartcard_number: raw.data?.customer_number ?? input.smartcard_number,
      message:          raw.message ?? "Decoder verified successfully",
      raw_response:     raw,
    };
  }

  private async purchaseCable(
    input: ProviderPurchaseInput,
    apiKey: string,
    baseUrl: string,
  ): Promise<ProviderPurchaseResult> {
    const variationCode = input.provider_variation_code ?? input.variation_code ?? null;
    if (!variationCode) {
      throw new Error(
        "eData cable: plan ID is missing. " +
        "Go to Admin → Service Plans, find this plan, and ensure " +
        "'Provider Plan ID / Variation Code' is set to the eData numeric plan ID."
      );
    }
    const planId = parseInt(variationCode, 10);
    if (isNaN(planId) || planId <= 0) {
      throw new Error(
        `eData cable: plan ID '${variationCode}' is not a valid positive integer. ` +
        "Update the plan in Admin → Service Plans with the correct numeric eData cable plan ID."
      );
    }

    const payload = {
      plan_id:          planId,
      smartcard_number: input.smartcard_number ?? "",
      phone:            input.phone ?? "",
    };

    console.log("[EDATA] cable purchase →", {
      plan_id: planId, smartcard: maskPhone(input.smartcard_number), reference: input.reference,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/cable/`, {
      method:  "POST",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`eData cable: HTTP ${response.status} authentication failure — verify api_key`);
    }

    const raw = await this.parseJson<EdataCablePurchaseResponse>(response, "cable purchase");

    const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);
    const rawStatusLower = (raw.status ?? raw.Status ?? "").toLowerCase();
    const isSuccess = SUCCESS_VALUES.has(rawStatusLower);

    console.log("[EDATA] cable purchase ←", {
      status: raw.status, Status: raw.Status, message: raw.message, reference: input.reference,
    });

    return {
      success:            isSuccess,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (isSuccess ? "Cable TV subscription successful" : "Cable TV subscription failed"),
      status:             isSuccess ? "successful" : "failed",
      raw_response:       {
        status: raw.status, Status: raw.Status, message: raw.message,
        api_response: raw.api_response, balance_before: raw.balance_before, balance_after: raw.balance_after,
      },
    };
  }

  // ── Plan listing ─────────────────────────────────────────────────────────

  async fetchPlans(
    serviceType: "data" | "cable_tv" | "electricity",
    network?:    string,
  ): Promise<Array<Record<string, unknown>>> {
    if (serviceType === "cable_tv")    return CABLE_TV_PLAN_LIST;
    if (serviceType === "electricity") return ELECTRICITY_DISCO_LIST;

    const plans = network
      ? DATA_PLAN_LIST.filter((p) => String(p.network).toLowerCase() === network.toLowerCase())
      : DATA_PLAN_LIST;

    if (plans.length === 0 && network) {
      const available = [...new Set(DATA_PLAN_LIST.map((p) => p.network))].join(", ");
      throw new Error(`No eData plans available for network '${network}'. Available: ${available}.`);
    }

    return plans;
  }

  // eData does not expose a transaction verify / requery endpoint in the
  // available documentation. Return a safe result so callers can handle it.
  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    console.warn("[EDATA] verifyTransaction called but no query endpoint is documented", { reference });
    return {
      found:   false,
      status:  "pending",
      message: "eData does not support transaction verification — check eData dashboard",
    };
  }

  async getBalance(): Promise<ProviderBalance> {
    throw new Error("eData: balance endpoint not available — no balance API is documented for this provider");
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const creds = await getProviderCredentials(this.name);

    if (!creds) {
      return { healthy: false, message: "eData credentials not configured — add base_url and api_key in Admin > API Integrations" };
    }
    if (!creds.api_key_encrypted) {
      return { healthy: false, message: "eData api_key not set — add in Admin > API Integrations > eData" };
    }
    if (!creds.base_url) {
      return { healthy: false, message: "eData base_url not set — add in Admin > API Integrations > eData" };
    }

    return {
      healthy: true,
      message: "eData credentials configured (no live ping — eData has no balance/ping endpoint)",
    };
  }
}