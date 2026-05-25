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
import {
  getProviderCredentials,
  upsertProviderCredentials,
} from "./provider-credentials.service";
import { logger } from "../../../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const LDW_TIMEOUT_MS       = 30_000;
const LDW_DEFAULT_BASE_URL = "https://legitdataway.com";

// ── Network maps ──────────────────────────────────────────────────────────────

// Airtime endpoint IDs (docs: MTN=1, Airtel=2, Glo=3, 9mobile=4)
const AIRTIME_NETWORK_ID_MAP: Record<string, number> = {
  mtn:       1,
  airtel:    2,
  glo:       3,
  "9mobile": 4,
  etisalat:  4,
};

// Data endpoint IDs (different from airtime: MTN=1, Glo=2, 9mobile=3, Airtel=4)
const DATA_NETWORK_ID_MAP: Record<string, number> = {
  mtn:       1,
  glo:       2,
  "9mobile": 3,
  etisalat:  3,
  airtel:    4,
};

// Cable TV provider IDs (docs: GOTV=1, DSTV=2, STARTIME=3)
const CABLE_ID_MAP: Record<string, number> = {
  gotv:      1,
  dstv:      2,
  startimes: 3,
  startime:  3,
};

// Hardcoded data plan list sourced from the LegitDataWay dashboard documentation page.
// LegitDataWay does not expose a /api/plans endpoint — these are taken directly
// from their docs at https://app.legitdataway.com/documentation/data.
const DATA_PLAN_LIST: Array<Record<string, unknown>> = [
  // ── MTN SME ─────────────────────────────────────────────────────────────────
  { id:  36, network: "mtn", plan_type: "SME",               plan: "500MB",  amount:    330, month_validate: "30 days"  },
  { id:  37, network: "mtn", plan_type: "SME",               plan: "1GB",    amount:    430, month_validate: "30 days"  },
  { id:  38, network: "mtn", plan_type: "SME",               plan: "2GB",    amount:   1000, month_validate: "30 days"  },
  { id:  39, network: "mtn", plan_type: "SME",               plan: "3GB",    amount:   1500, month_validate: "30 days"  },
  { id:  40, network: "mtn", plan_type: "SME",               plan: "5GB",    amount:   2500, month_validate: "30 days"  },
  { id:  41, network: "mtn", plan_type: "SME",               plan: "10GB",   amount:   5000, month_validate: "30 days"  },
  { id: 315, network: "mtn", plan_type: "SME",               plan: "1GB",    amount:    530, month_validate: "30 days"  },
  { id: 316, network: "mtn", plan_type: "SME",               plan: "1GB",    amount:    270, month_validate: "1 day"    },
  { id: 317, network: "mtn", plan_type: "SME",               plan: "2.5GB",  amount:    550, month_validate: "1 day"    },
  { id: 318, network: "mtn", plan_type: "SME",               plan: "5GB",    amount:   1500, month_validate: "20 days"  },
  // ── MTN COOPERATE GIFTING ────────────────────────────────────────────────────
  { id:  46, network: "mtn", plan_type: "COOPERATE GIFTING", plan: "1GB",    amount:    250, month_validate: "1 day"    },
  // ── MTN GIFTING ─────────────────────────────────────────────────────────────
  { id: 273, network: "mtn", plan_type: "GIFTING",           plan: "3.5GB",  amount:   2450, month_validate: "30 days"  },
  { id: 274, network: "mtn", plan_type: "GIFTING",           plan: "3.5GB",  amount:   1470, month_validate: "7 days"   },
  { id: 275, network: "mtn", plan_type: "GIFTING",           plan: "1.8GB",  amount:   1470, month_validate: "30 days"  },
  { id: 276, network: "mtn", plan_type: "GIFTING",           plan: "7GB",    amount:   3430, month_validate: "30 days"  },
  { id: 277, network: "mtn", plan_type: "GIFTING",           plan: "7GB",    amount:   1764, month_validate: "2 days"   },
  { id: 278, network: "mtn", plan_type: "GIFTING",           plan: "5.5GB",  amount:   2940, month_validate: "30 days"  },
  { id: 279, network: "mtn", plan_type: "GIFTING",           plan: "10GB",   amount:   4410, month_validate: "30 days"  },
  { id: 280, network: "mtn", plan_type: "GIFTING",           plan: "11GB",   amount:   3430, month_validate: "7 days"   },
  { id: 281, network: "mtn", plan_type: "GIFTING",           plan: "12.5GB", amount:   5390, month_validate: "30 days"  },
  { id: 282, network: "mtn", plan_type: "GIFTING",           plan: "14.5GB", amount:   4900, month_validate: "30 days"  },
  { id: 283, network: "mtn", plan_type: "GIFTING",           plan: "16.5GB", amount:   6370, month_validate: "30 days"  },
  { id: 284, network: "mtn", plan_type: "GIFTING",           plan: "20GB",   amount:   7350, month_validate: "30 days"  },
  { id: 285, network: "mtn", plan_type: "GIFTING",           plan: "25GB",   amount:   6860, month_validate: "30 days"  },
  { id: 286, network: "mtn", plan_type: "GIFTING",           plan: "25GB",   amount:   8820, month_validate: "30 days"  },
  { id: 287, network: "mtn", plan_type: "GIFTING",           plan: "34GB",   amount:   9800, month_validate: "30 days"  },
  { id: 288, network: "mtn", plan_type: "GIFTING",           plan: "36GB",   amount:  10780, month_validate: "30 days"  },
  { id: 289, network: "mtn", plan_type: "GIFTING",           plan: "40GB",   amount:   8820, month_validate: "60 days"  },
  { id: 290, network: "mtn", plan_type: "GIFTING",           plan: "65GB",   amount:  15680, month_validate: "30 days"  },
  { id: 291, network: "mtn", plan_type: "GIFTING",           plan: "75GB",   amount:  17600, month_validate: "30 days"  },
  { id: 292, network: "mtn", plan_type: "GIFTING",           plan: "90GB",   amount:  24500, month_validate: "60 days"  },
  { id: 293, network: "mtn", plan_type: "GIFTING",           plan: "165GB",  amount:  34300, month_validate: "30 days"  },
  { id: 294, network: "mtn", plan_type: "GIFTING",           plan: "250GB",  amount:  53900, month_validate: "30 days"  },
  { id: 295, network: "mtn", plan_type: "GIFTING",           plan: "800GB",  amount: 122500, month_validate: "365 days" },
  // ── GLO SME ─────────────────────────────────────────────────────────────────
  { id: 220, network: "glo", plan_type: "SME",               plan: "500MB",  amount:    190, month_validate: "14 days"  },
  { id: 221, network: "glo", plan_type: "SME",               plan: "1GB",    amount:    280, month_validate: "14 days"  },
  { id: 222, network: "glo", plan_type: "SME",               plan: "1GB",    amount:    245, month_validate: "3 days"   },
  { id: 223, network: "glo", plan_type: "SME",               plan: "1GB",    amount:    290, month_validate: "7 days"   },
  { id: 224, network: "glo", plan_type: "SME",               plan: "3GB",    amount:    720, month_validate: "3 days"   },
  { id: 225, network: "glo", plan_type: "SME",               plan: "3GB",    amount:    850, month_validate: "7 days"   },
  { id: 226, network: "glo", plan_type: "SME",               plan: "3GB",    amount:    855, month_validate: "14 days"  },
  { id: 227, network: "glo", plan_type: "SME",               plan: "5GB",    amount:   1220, month_validate: "3 days"   },
  { id: 228, network: "glo", plan_type: "SME",               plan: "5GB",    amount:   1400, month_validate: "7 days"   },
  { id: 229, network: "glo", plan_type: "SME",               plan: "5GB",    amount:   1401, month_validate: "14 days"  },
  { id: 230, network: "glo", plan_type: "SME",               plan: "10GB",   amount:   2800, month_validate: "14 days"  },
  // ── GLO GIFTING ─────────────────────────────────────────────────────────────
  { id: 298, network: "glo", plan_type: "GIFTING",           plan: "45MB",   amount:     45, month_validate: "1 day"    },
  { id: 299, network: "glo", plan_type: "GIFTING",           plan: "100MB",  amount:     98, month_validate: "1 day"    },
  { id: 300, network: "glo", plan_type: "GIFTING",           plan: "200MB",  amount:    196, month_validate: "2 days"   },
  { id: 301, network: "glo", plan_type: "GIFTING",           plan: "1.5GB",  amount:    294, month_validate: "1 day"    },
  { id: 302, network: "glo", plan_type: "GIFTING",           plan: "3GB",    amount:    735, month_validate: "2 days"   },
  { id: 303, network: "glo", plan_type: "GIFTING",           plan: "2.5GB",  amount:    490, month_validate: "2 days"   },
  { id: 304, network: "glo", plan_type: "GIFTING",           plan: "1.5GB",  amount:    490, month_validate: "7 days"   },
  { id: 305, network: "glo", plan_type: "GIFTING",           plan: "2.6GB",  amount:    980, month_validate: "30 days"  },
  { id: 306, network: "glo", plan_type: "GIFTING",           plan: "5GB",    amount:   1470, month_validate: "30 days"  },
  { id: 307, network: "glo", plan_type: "GIFTING",           plan: "6.15GB", amount:   1960, month_validate: "30 days"  },
  { id: 308, network: "glo", plan_type: "GIFTING",           plan: "7.25GB", amount:   2450, month_validate: "30 days"  },
  { id: 309, network: "glo", plan_type: "GIFTING",           plan: "10GB",   amount:   2940, month_validate: "30 days"  },
  { id: 310, network: "glo", plan_type: "GIFTING",           plan: "12.5GB", amount:   3920, month_validate: "30 days"  },
  { id: 311, network: "glo", plan_type: "GIFTING",           plan: "16GB",   amount:   4900, month_validate: "30 days"  },
  { id: 312, network: "glo", plan_type: "GIFTING",           plan: "20GB",   amount:   5880, month_validate: "30 days"  },
  { id: 314, network: "glo", plan_type: "GIFTING",           plan: "28GB",   amount:   7840, month_validate: "30 days"  },
  // ── GLO COOPERATE GIFTING ────────────────────────────────────────────────────
  { id:  70, network: "glo", plan_type: "COOPERATE GIFTING", plan: "200MB",  amount:     90, month_validate: "30 days"  },
  { id:  71, network: "glo", plan_type: "COOPERATE GIFTING", plan: "500MB",  amount:    200, month_validate: "30 days"  },
  { id:  72, network: "glo", plan_type: "COOPERATE GIFTING", plan: "1GB",    amount:    410, month_validate: "30 days"  },
  { id:  73, network: "glo", plan_type: "COOPERATE GIFTING", plan: "2GB",    amount:    830, month_validate: "30 days"  },
  { id:  74, network: "glo", plan_type: "COOPERATE GIFTING", plan: "3GB",    amount:   1245, month_validate: "30 days"  },
  { id:  75, network: "glo", plan_type: "COOPERATE GIFTING", plan: "5GB",    amount:   2075, month_validate: "30 days"  },
  { id:  76, network: "glo", plan_type: "COOPERATE GIFTING", plan: "10GB",   amount:   4150, month_validate: "30 days"  },
  // ── AIRTEL GIFTING ───────────────────────────────────────────────────────────
  { id: 231, network: "airtel", plan_type: "GIFTING",        plan: "10GB",   amount:   3000, month_validate: "30 days"  },
  { id: 232, network: "airtel", plan_type: "GIFTING",        plan: "1GB",    amount:    780, month_validate: "7 days"   },
  { id: 233, network: "airtel", plan_type: "GIFTING",        plan: "1GB",    amount:    290, month_validate: "3 days"   },
  { id: 234, network: "airtel", plan_type: "GIFTING",        plan: "2GB",    amount:   1425, month_validate: "30 days"  },
  { id: 235, network: "airtel", plan_type: "GIFTING",        plan: "500MB",  amount:    490, month_validate: "7 days"   },
  { id: 236, network: "airtel", plan_type: "GIFTING",        plan: "3GB",    amount:   1960, month_validate: "30 days"  },
  { id: 237, network: "airtel", plan_type: "GIFTING",        plan: "3GB",    amount:    735, month_validate: "2 days"   },
  { id: 238, network: "airtel", plan_type: "GIFTING",        plan: "1.5GB",  amount:    490, month_validate: "7 days"   },
  { id: 239, network: "airtel", plan_type: "GIFTING",        plan: "1.5GB",  amount:    980, month_validate: "7 days"   },
  { id: 240, network: "airtel", plan_type: "GIFTING",        plan: "1.5GB",  amount:    505, month_validate: "1 day"    },
  { id: 241, network: "airtel", plan_type: "GIFTING",        plan: "1.5GB",  amount:    405, month_validate: "1 day"    },
  { id: 242, network: "airtel", plan_type: "GIFTING",        plan: "75MB",   amount:     74, month_validate: "1 day"    },
  { id: 243, network: "airtel", plan_type: "GIFTING",        plan: "110MB",  amount:     98, month_validate: "1 day"    },
  { id: 244, network: "airtel", plan_type: "GIFTING",        plan: "250MB",  amount:     50, month_validate: "1 day"    },
  { id: 245, network: "airtel", plan_type: "GIFTING",        plan: "2GB",    amount:    570, month_validate: "7 days"   },
  { id: 247, network: "airtel", plan_type: "GIFTING",        plan: "600MB",  amount:    205, month_validate: "2 days"   },
  { id: 248, network: "airtel", plan_type: "GIFTING",        plan: "3GB",    amount:   1960, month_validate: "30 days"  },
  { id: 249, network: "airtel", plan_type: "GIFTING",        plan: "4GB",    amount:   2450, month_validate: "30 days"  },
  { id: 250, network: "airtel", plan_type: "GIFTING",        plan: "7GB",    amount:   1470, month_validate: "7 days"   },
  { id: 251, network: "airtel", plan_type: "GIFTING",        plan: "8GB",    amount:   2970, month_validate: "30 days"  },
  { id: 252, network: "airtel", plan_type: "GIFTING",        plan: "10GB",   amount:   3920, month_validate: "30 days"  },
  { id: 253, network: "airtel", plan_type: "GIFTING",        plan: "13GB",   amount:   4900, month_validate: "30 days"  },
  { id: 254, network: "airtel", plan_type: "GIFTING",        plan: "25GB",   amount:   7840, month_validate: "30 days"  },
  { id: 255, network: "airtel", plan_type: "GIFTING",        plan: "35GB",   amount:   9800, month_validate: "30 days"  },
  { id: 256, network: "airtel", plan_type: "GIFTING",        plan: "60GB",   amount:  14700, month_validate: "30 days"  },
  { id: 257, network: "airtel", plan_type: "GIFTING",        plan: "100GB",  amount:  19600, month_validate: "30 days"  },
  { id: 258, network: "airtel", plan_type: "GIFTING",        plan: "300GB",  amount:  49000, month_validate: "90 days"  },
  { id: 259, network: "airtel", plan_type: "GIFTING",        plan: "350GB",  amount:  58800, month_validate: "120 days" },
  { id: 260, network: "airtel", plan_type: "GIFTING",        plan: "685GB",  amount:  98000, month_validate: "365 days" },
  { id: 296, network: "airtel", plan_type: "GIFTING",        plan: "8GB",    amount:   1960, month_validate: "30 days"  },
  { id: 297, network: "airtel", plan_type: "GIFTING",        plan: "60GB",   amount:   9800, month_validate: "365 days" },
  // ── 9MOBILE SME ─────────────────────────────────────────────────────────────
  { id:  61, network: "9mobile", plan_type: "SME",           plan: "1.1GB",  amount:    400, month_validate: "30 days"  },
  { id:  62, network: "9mobile", plan_type: "SME",           plan: "2GB",    amount:    800, month_validate: "30 days"  },
  // ── 9MOBILE GIFTING ──────────────────────────────────────────────────────────
  { id:  68, network: "9mobile", plan_type: "GIFTING",       plan: "1.5GB",  amount:    880, month_validate: "30 days"  },
  { id:  69, network: "9mobile", plan_type: "GIFTING",       plan: "500MB",  amount:    450, month_validate: "30 days"  },
  // ── 9MOBILE COOPERATE GIFTING ────────────────────────────────────────────────
  { id:  85, network: "9mobile", plan_type: "COOPERATE GIFTING", plan: "500MB", amount:   250, month_validate: "30 days" },
  { id:  86, network: "9mobile", plan_type: "COOPERATE GIFTING", plan: "1GB",   amount:   500, month_validate: "30 days" },
  { id:  87, network: "9mobile", plan_type: "COOPERATE GIFTING", plan: "2GB",   amount:  1000, month_validate: "30 days" },
  { id:  88, network: "9mobile", plan_type: "COOPERATE GIFTING", plan: "3GB",   amount:  1500, month_validate: "30 days" },
  { id:  89, network: "9mobile", plan_type: "COOPERATE GIFTING", plan: "4GB",   amount:  2000, month_validate: "30 days" },
  { id:  90, network: "9mobile", plan_type: "COOPERATE GIFTING", plan: "5GB",   amount:  2500, month_validate: "30 days" },
  { id:  91, network: "9mobile", plan_type: "COOPERATE GIFTING", plan: "10GB",  amount:  5000, month_validate: "30 days" },
];

// Cable TV plan list — LegitDataWay uses slug-based cableplan codes.
// plan_code is sent as-is to the API in the cableplan field.
const CABLE_TV_PLAN_LIST: Array<Record<string, unknown>> = [
  // ── DSTV ─────────────────────────────────────────────────────────────────────
  { plan_code: "dstv-padi",         name: "DStv Padi",         operator: "dstv",      amount:  2000 },
  { plan_code: "dstv-yanga",        name: "DStv Yanga",        operator: "dstv",      amount:  3500 },
  { plan_code: "dstv-confam",       name: "DStv Confam",       operator: "dstv",      amount:  6500 },
  { plan_code: "dstv-compact",      name: "DStv Compact",      operator: "dstv",      amount:  8500 },
  { plan_code: "dstv-compact-plus", name: "DStv Compact Plus", operator: "dstv",      amount: 13500 },
  { plan_code: "dstv-premium",      name: "DStv Premium",      operator: "dstv",      amount: 26500 },
  { plan_code: "dstv-asia",         name: "DStv Asia",         operator: "dstv",      amount:  7900 },
  // ── GOTV ─────────────────────────────────────────────────────────────────────
  { plan_code: "gotv-lite",         name: "GOtv Lite",         operator: "gotv",      amount:  1500 },
  { plan_code: "gotv-jinja",        name: "GOtv Jinja",        operator: "gotv",      amount:  2900 },
  { plan_code: "gotv-jolli",        name: "GOtv Jolli",        operator: "gotv",      amount:  4200 },
  { plan_code: "gotv-max",          name: "GOtv Max",          operator: "gotv",      amount:  5500 },
  { plan_code: "gotv-supa",         name: "GOtv Supa",         operator: "gotv",      amount:  9000 },
  { plan_code: "gotv-supa-plus",    name: "GOtv Supa+",        operator: "gotv",      amount: 12500 },
  // ── STARTIMES ────────────────────────────────────────────────────────────────
  { plan_code: "startimes-nova",    name: "StarTimes Nova",    operator: "startimes", amount:  1500 },
  { plan_code: "startimes-basic",   name: "StarTimes Basic",   operator: "startimes", amount:  2900 },
  { plan_code: "startimes-smart",   name: "StarTimes Smart",   operator: "startimes", amount:  4200 },
  { plan_code: "startimes-classic", name: "StarTimes Classic", operator: "startimes", amount:  5500 },
  { plan_code: "startimes-super",   name: "StarTimes Super",   operator: "startimes", amount:  8900 },
];

// Electricity DISCO list — provider_code is the numeric LegitDataWay disco ID.
// Each DISCO offers prepaid and postpaid. Amounts are 0 (variable at purchase).
const ELECTRICITY_DISCO_LIST: Array<Record<string, unknown>> = [
  { plan_code: "ekedc-prepaid",   name: "EKEDC Prepaid",          operator: "ekedc",  plan_category: "prepaid",  provider_code: "1"  },
  { plan_code: "ekedc-postpaid",  name: "EKEDC Postpaid",         operator: "ekedc",  plan_category: "postpaid", provider_code: "1"  },
  { plan_code: "ikedc-prepaid",   name: "IKEDC Prepaid",          operator: "ikedc",  plan_category: "prepaid",  provider_code: "2"  },
  { plan_code: "ikedc-postpaid",  name: "IKEDC Postpaid",         operator: "ikedc",  plan_category: "postpaid", provider_code: "2"  },
  { plan_code: "aedc-prepaid",    name: "AEDC Prepaid",           operator: "aedc",   plan_category: "prepaid",  provider_code: "3"  },
  { plan_code: "aedc-postpaid",   name: "AEDC Postpaid",          operator: "aedc",   plan_category: "postpaid", provider_code: "3"  },
  { plan_code: "kedc-prepaid",    name: "KEDC Prepaid",           operator: "kedc",   plan_category: "prepaid",  provider_code: "4"  },
  { plan_code: "kedc-postpaid",   name: "KEDC Postpaid",          operator: "kedc",   plan_category: "postpaid", provider_code: "4"  },
  { plan_code: "phedc-prepaid",   name: "PHEDC Prepaid",          operator: "phedc",  plan_category: "prepaid",  provider_code: "5"  },
  { plan_code: "phedc-postpaid",  name: "PHEDC Postpaid",         operator: "phedc",  plan_category: "postpaid", provider_code: "5"  },
  { plan_code: "jedc-prepaid",    name: "JEDC Prepaid",           operator: "jedc",   plan_category: "prepaid",  provider_code: "6"  },
  { plan_code: "jedc-postpaid",   name: "JEDC Postpaid",          operator: "jedc",   plan_category: "postpaid", provider_code: "6"  },
  { plan_code: "ibedc-prepaid",   name: "IBEDC Prepaid",          operator: "ibedc",  plan_category: "prepaid",  provider_code: "7"  },
  { plan_code: "ibedc-postpaid",  name: "IBEDC Postpaid",         operator: "ibedc",  plan_category: "postpaid", provider_code: "7"  },
  { plan_code: "kaedc-prepaid",   name: "KAEDC Prepaid",          operator: "kaedc",  plan_category: "prepaid",  provider_code: "8"  },
  { plan_code: "kaedc-postpaid",  name: "KAEDC Postpaid",         operator: "kaedc",  plan_category: "postpaid", provider_code: "8"  },
  { plan_code: "eedc-prepaid",    name: "EEDC Prepaid",           operator: "eedc",   plan_category: "prepaid",  provider_code: "9"  },
  { plan_code: "eedc-postpaid",   name: "EEDC Postpaid",          operator: "eedc",   plan_category: "postpaid", provider_code: "9"  },
  { plan_code: "bedc-prepaid",    name: "BEDC Prepaid",           operator: "bedc",   plan_category: "prepaid",  provider_code: "10" },
  { plan_code: "bedc-postpaid",   name: "BEDC Postpaid",          operator: "bedc",   plan_category: "postpaid", provider_code: "10" },
  { plan_code: "yedc-prepaid",    name: "YEDC Prepaid",           operator: "yedc",   plan_category: "prepaid",  provider_code: "11" },
  { plan_code: "yedc-postpaid",   name: "YEDC Postpaid",          operator: "yedc",   plan_category: "postpaid", provider_code: "11" },
  { plan_code: "aba-prepaid",     name: "ABA/APLE Prepaid",       operator: "aba",    plan_category: "prepaid",  provider_code: "12" },
  { plan_code: "aba-postpaid",    name: "ABA/APLE Postpaid",      operator: "aba",    plan_category: "postpaid", provider_code: "12" },
];

// ── Response shapes ───────────────────────────────────────────────────────────

interface LDWTokenResponse {
  token?:        string;
  access_token?: string;
  AccessToken?:  string;      // LegitDataWay actual field name
  key?:          string;
  balance?:      string | number;  // returned alongside the token
  username?:     string;
  status?:       string | number;
  detail?:       string;
  message?:      string;
}

interface LDWBaseResponse {
  Status?:  string;
  status?:  string;
  message?: string;
  detail?:  string;
}

interface LDWTopupResponse extends LDWBaseResponse {
  api_response?:   { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

interface LDWDataResponse extends LDWBaseResponse {
  api_response?:   { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

interface LDWElectricityResponse extends LDWBaseResponse {
  token?:          string;
  units?:          string | number;
  api_response?:   { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

interface LDWBillValidationResponse {
  Status?:        string;
  status?:        string;
  name?:          string;
  Customer_Name?: string;
  customer_name?: string;
  Address?:       string;
  address?:       string;
  Meter_Number?:  string;
  meter_number?:  string;
  message?:       string;
  detail?:        string;
}

interface LDWCableValidationResponse {
  Status?:           string;
  status?:           string;
  name?:             string;
  Customer_Name?:    string;
  customer_name?:    string;
  Current_Bouquet?:  string;
  current_bouquet?:  string;
  Bouquet?:          string;
  Due_Date?:         string;
  due_date?:         string;
  Smartcard_Number?: string;
  smartcard_number?: string;
  message?:          string;
  detail?:           string;
}

interface LDWCablePurchaseResponse extends LDWBaseResponse {
  Customer_Name?:  string;
  customer_name?:  string;
  Package?:        string;
  package?:        string;
  Bouquet?:        string;
  bouquet?:        string;
  Due_Date?:       string;
  due_date?:       string;
  api_response?:   { status?: string; message?: string } | null;
  balance_before?: string;
  balance_after?:  string;
}

interface LDWExamResponse extends LDWBaseResponse {
  pin?:         string;
  pins?:        Array<{ pin?: string; serial?: string }>;
  carddetails?: Array<{ pin?: string; serial?: string }>;
  api_response?: { status?: string; message?: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPrefix(variationCode: string): string {
  return variationCode.split("-")[0].toLowerCase();
}

function resolveAirtimeNetworkId(variationCode: string): number | null {
  const id = AIRTIME_NETWORK_ID_MAP[extractPrefix(variationCode)];
  return id !== undefined ? id : null;
}

function resolveDataNetworkId(variationCode: string): number | null {
  const id = DATA_NETWORK_ID_MAP[extractPrefix(variationCode)];
  return id !== undefined ? id : null;
}

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 5) return "***";
  return `${phone.slice(0, 5)}${"*".repeat(phone.length - 5)}`;
}

const SUCCESS_VALUES = new Set(["success", "successful", "delivered"]);

function isSuccessStatus(raw: LDWBaseResponse): boolean {
  return SUCCESS_VALUES.has((raw.status ?? raw.Status ?? "").toLowerCase());
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class LegitDataWayProvider extends HttpVTUProvider {
  readonly name = "legitdataway";

  constructor() {
    super("legitdataway");
  }

  // ── HTTP primitives + auth helpers ───────────────────────────────────────

  private async fetchWithTimeout(
    url: string,
    init: {
      method:   string;
      headers:  Record<string, string>;
      body?:    string;
    },
    timeoutMs = LDW_TIMEOUT_MS,
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
        throw new Error(`LegitDataWay request timed out after ${timeoutMs}ms`);
      }
      throw new Error(`LegitDataWay network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response, context: string): Promise<T> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Error(`LegitDataWay: could not read ${context} response body`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      logger.warn("legitdataway_non_json_response", {
        context,
        http_status: response.status,
        body_preview: text.slice(0, 300),
      });
      throw new Error(
        `LegitDataWay: non-JSON ${context} response (HTTP ${response.status}) — body: ${text.slice(0, 200)}`,
      );
    }
  }

  // Reads the response body for a diagnostic detail string — safe to call only
  // when the body has not been consumed yet (i.e. right after a fetchWithTimeout).
  private async readErrorBody(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text ? ` — provider says: ${text.slice(0, 200)}` : "";
    } catch {
      return "";
    }
  }

  // LegitDataWay returns HTTP 403 for BOTH expired tokens AND validation errors
  // (e.g. missing required field).  Call this when a first request gets 401/403:
  //   - If the body contains a recognisable validation message  → throws immediately
  //     (no token refresh needed — a fresh token won't fix a bad payload).
  //   - Otherwise → refreshes the token and returns it so the caller can retry.
  private async refreshOrThrowValidation(
    response:  Response,
    context:   string,
    username:  string,
    password:  string,
    baseUrl:   string,
  ): Promise<string> {
    let bodyJson: Record<string, unknown> = {};
    try {
      const text = await response.text();
      try { bodyJson = JSON.parse(text); } catch { /* non-JSON — treat as auth error */ }
    } catch { /* body unreadable */ }

    const msg = typeof bodyJson.message === "string" ? bodyJson.message.toLowerCase() : "";
    const isValidation =
      msg.length > 0 &&
      !msg.includes("token") &&
      !msg.includes("authenticat") &&
      !msg.includes("credential") &&
      !msg.includes("permission");

    if (isValidation) {
      throw new Error(
        `LegitDataWay ${context}: request rejected — ${bodyJson.message}`,
      );
    }

    return this.refreshToken(username, password, baseUrl);
  }

  // ── Auth / token management ───────────────────────────────────────────────
  //
  // LegitDataWay uses token-based auth:
  //   1. Obtain token:  POST /api/user  Authorization: Basic base64(username:password)
  //   2. Use token:     Any request     Authorization: Token <access_token>
  //
  // Credential mapping (provider_credentials table):
  //   username_encrypted   → LegitDataWay account username
  //   password_encrypted   → LegitDataWay account password
  //   bearer_token_encrypted → cached access token (auto-populated on first use)
  //   base_url             → defaults to https://legitdataway.com

  private async resolveAuth(): Promise<{
    token:    string;
    baseUrl:  string;
    username: string;
    password: string;
  }> {
    const creds = await this.requireCredentials();

    const username = (creds.username_encrypted ?? "").trim();
    const password = (creds.password_encrypted ?? "").trim();
    const baseUrl  = (creds.base_url ?? "").trim().replace(/\/$/, "") || LDW_DEFAULT_BASE_URL;

    if (!username) {
      throw new Error(
        "LegitDataWay: username not set — go to Admin > API Integrations > LegitDataWay " +
        "and fill the Username field",
      );
    }
    if (!password) {
      throw new Error(
        "LegitDataWay: password not set — go to Admin > API Integrations > LegitDataWay " +
        "and fill the Password field",
      );
    }

    // Reuse cached token if available — avoids a round-trip to /api/user on every call
    const cachedToken = (creds.bearer_token_encrypted ?? "").trim();
    if (cachedToken) {
      logger.info("legitdataway_auth_cached_token", {
        token_length: cachedToken.length,
      });
      return { token: cachedToken, baseUrl, username, password };
    }

    // No cached token — generate one and persist it for subsequent calls
    const token = await this.generateToken(username, password, baseUrl);
    await this.storeToken(token);
    return { token, baseUrl, username, password };
  }

  private async callTokenEndpoint(
    username:   string,
    password:   string,
    baseUrl:    string,
    timeoutMs?: number,
  ): Promise<LDWTokenResponse> {
    const basicCred = Buffer.from(`${username}:${password}`).toString("base64");

    logger.info("legitdataway_token_generate_started", {
      endpoint:        "/api/user",
      username_length: username.length,
    });

    const response = await this.fetchWithTimeout(`${baseUrl}/api/user`, {
      method:  "POST",
      headers: {
        "Authorization": `Basic ${basicCred}`,
        "Content-Type":  "application/json",
      },
    }, timeoutMs);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `LegitDataWay: token generation failed (HTTP ${response.status}) — ` +
        `verify username and password in Admin > API Integrations > LegitDataWay`,
      );
    }

    return this.parseJson<LDWTokenResponse>(response, "token generation");
  }

  private extractToken(raw: LDWTokenResponse): string {
    const token = raw.token ?? raw.access_token ?? raw.AccessToken ?? raw.key ?? null;
    if (!token) {
      throw new Error(
        `LegitDataWay: access token not found in response — ` +
        `response keys: [${Object.keys(raw).join(", ")}]` +
        (raw.detail ?? raw.message ? ` — detail: ${raw.detail ?? raw.message}` : ""),
      );
    }
    logger.info("legitdataway_token_extracted", { token_length: token.length });
    return token;
  }

  private async generateToken(
    username:   string,
    password:   string,
    baseUrl:    string,
    timeoutMs?: number,
  ): Promise<string> {
    const raw = await this.callTokenEndpoint(username, password, baseUrl, timeoutMs);
    return this.extractToken(raw);
  }

  private async storeToken(token: string): Promise<void> {
    await upsertProviderCredentials({
      provider_code: this.name,
      bearer_token:  token,
    }).catch((err) =>
      logger.warn("legitdataway_token_store_failed", { error: (err as Error).message }),
    );
  }

  // Invalidate cached token, generate a fresh one, and persist it.
  // Called automatically on HTTP 401 or 403 from any service endpoint.
  private async refreshToken(
    username: string,
    password: string,
    baseUrl:  string,
  ): Promise<string> {
    logger.warn("legitdataway_token_refresh", {
      reason: "HTTP 401/403 — cached token rejected, regenerating",
    });
    // Use the full provider timeout for retries during real transactions
    const token = await this.generateToken(username, password, baseUrl, LDW_TIMEOUT_MS);
    await this.storeToken(token);
    return token;
  }

  // ── VTUProvider interface ─────────────────────────────────────────────────

  async purchase(input: ProviderPurchaseInput): Promise<ProviderPurchaseResult> {
    if (input.service_type === "airtime")     return this.purchaseAirtime(input);
    if (input.service_type === "data")        return this.purchaseData(input);
    if (input.service_type === "electricity") return this.purchaseElectricity(input);
    if (input.service_type === "cable_tv")    return this.purchaseCable(input);
    if (input.service_type === "exam_pin")    return this.purchaseExamPin(input);

    throw new Error(
      `LegitDataWay: service_type '${input.service_type}' not implemented. ` +
      `Supported: airtime, data, electricity, cable_tv, exam_pin.`,
    );
  }

  // ── Airtime ───────────────────────────────────────────────────────────────

  private async purchaseAirtime(
    input: ProviderPurchaseInput,
  ): Promise<ProviderPurchaseResult> {
    const { token, baseUrl, username, password } = await this.resolveAuth();

    const networkId = resolveAirtimeNetworkId(input.variation_code ?? "");
    if (networkId === null) {
      throw new Error(
        `LegitDataWay airtime: cannot resolve network for variation_code '${input.variation_code}'. ` +
        `Expected prefix: mtn | airtel | glo | 9mobile`,
      );
    }

    const payload = {
      network:      networkId,
      phone:        input.phone ?? "",
      plan_type:    "VTU",
      amount:       input.amount,
      bypass:       false,
      "request-id": input.reference,
    };

    logger.info("legitdataway_airtime_request", {
      network:   networkId,
      amount:    input.amount,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    let response = await this.fetchWithTimeout(`${baseUrl}/api/topup`, {
      method:  "POST",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      const newToken = await this.refreshOrThrowValidation(response, "airtime", username, password, baseUrl);
      response = await this.fetchWithTimeout(`${baseUrl}/api/topup`, {
        method:  "POST",
        headers: { "Authorization": `Token ${newToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await this.readErrorBody(response);
      throw new Error(
        `LegitDataWay airtime: HTTP ${response.status} even after token refresh${detail}. ` +
        `Verify account credentials and that airtime service is enabled.`,
      );
    }

    const raw     = await this.parseJson<LDWTopupResponse>(response, "airtime topup");
    const success = isSuccessStatus(raw);

    logger.info("legitdataway_airtime_response", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      success,
      reference: input.reference,
    });

    return {
      success,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (success ? "Airtime purchase successful" : "Airtime purchase failed"),
      status:             success ? "successful" : "failed",
      raw_response: {
        status:         raw.status,
        Status:         raw.Status,
        message:        raw.message,
        api_response:   raw.api_response,
        balance_before: raw.balance_before,
        balance_after:  raw.balance_after,
      },
    };
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  private async purchaseData(
    input: ProviderPurchaseInput,
  ): Promise<ProviderPurchaseResult> {
    const { token, baseUrl, username, password } = await this.resolveAuth();

    const rawPlanId = input.provider_variation_code ?? null;
    if (!rawPlanId) {
      throw new Error(
        "LegitDataWay data: Provider plan ID is missing. " +
        "Go to Admin → Service Plans, find this data plan, and set " +
        "'Provider Variation Code' to the numeric plan ID from your LegitDataWay plan list.",
      );
    }
    const planId = parseInt(rawPlanId, 10);
    if (isNaN(planId) || planId <= 0) {
      throw new Error(
        `LegitDataWay data: Provider plan ID '${rawPlanId}' is not a valid positive integer. ` +
        "Update the plan in Admin → Service Plans with the correct numeric LegitDataWay plan ID.",
      );
    }

    const networkId = resolveDataNetworkId(input.variation_code ?? "");
    if (networkId === null) {
      throw new Error(
        `LegitDataWay data: cannot resolve network ID for variation_code '${input.variation_code}'. ` +
        `Expected prefix: mtn | glo | 9mobile | airtel`,
      );
    }

    const payload = {
      network:       networkId,
      phone:         input.phone ?? "",
      data_plan:     planId,
      bypass:        false,
      "request-id":  input.reference,
    };

    logger.info("legitdataway_data_request", {
      network:   networkId,
      plan:      planId,
      amount:    input.amount,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    let response = await this.fetchWithTimeout(`${baseUrl}/api/data`, {
      method:  "POST",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      const newToken = await this.refreshOrThrowValidation(response, "data", username, password, baseUrl);
      response = await this.fetchWithTimeout(`${baseUrl}/api/data`, {
        method:  "POST",
        headers: { "Authorization": `Token ${newToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await this.readErrorBody(response);
      throw new Error(
        `LegitDataWay data: HTTP ${response.status} even after token refresh${detail}. ` +
        `Verify account credentials and that data service is enabled.`,
      );
    }

    const raw     = await this.parseJson<LDWDataResponse>(response, "data purchase");
    const success = isSuccessStatus(raw);

    logger.info("legitdataway_data_response", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      success,
      reference: input.reference,
    });

    return {
      success,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (success ? "Data purchase successful" : "Data purchase failed"),
      status:             success ? "successful" : "failed",
      raw_response: {
        status:         raw.status,
        Status:         raw.Status,
        message:        raw.message,
        api_response:   raw.api_response,
        balance_before: raw.balance_before,
        balance_after:  raw.balance_after,
      },
    };
  }

  // ── Electricity ───────────────────────────────────────────────────────────

  async verifyMeter(input: MeterVerifyInput): Promise<MeterVerifyResult> {
    const { token, baseUrl, username, password } = await this.resolveAuth();

    if (!input.disco_name) {
      throw new Error(
        "LegitDataWay electricity: disco ID (Provider Variation Code) is missing. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the numeric LegitDataWay disco ID (e.g. 1 for Ikeja).",
      );
    }

    const discoId = parseInt(input.disco_name, 10);
    if (isNaN(discoId) || discoId <= 0) {
      throw new Error(
        `LegitDataWay electricity: disco ID '${input.disco_name}' is not a valid integer. ` +
        "Go to Admin → Service Plans and set 'Provider Variation Code' to the numeric LegitDataWay disco ID.",
      );
    }

    const params = new URLSearchParams({
      meter_number: input.meter_number,
      disco:        String(discoId),
      meter_type:   input.meter_type ?? "prepaid",
    });

    logger.info("legitdataway_meter_verify_request", {
      disco_name: input.disco_name,
      meter_type: input.meter_type,
      meter:      maskPhone(input.meter_number),
    });

    let response = await this.fetchWithTimeout(
      `${baseUrl}/api/bill/bill-validation?${params}`,
      { method: "GET", headers: { "Authorization": `Token ${token}` } },
    );

    if (response.status === 401 || response.status === 403) {
      const newToken = await this.refreshOrThrowValidation(response, "meter verify", username, password, baseUrl);
      response = await this.fetchWithTimeout(
        `${baseUrl}/api/bill/bill-validation?${params}`,
        { method: "GET", headers: { "Authorization": `Token ${newToken}` } },
      );
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await this.readErrorBody(response);
      throw new Error(
        `LegitDataWay meter verify: HTTP ${response.status} even after token refresh${detail}. ` +
        `Verify account credentials.`,
      );
    }

    const raw = await this.parseJson<LDWBillValidationResponse>(response, "meter verify");

    const s         = (raw.status ?? raw.Status ?? "").toLowerCase();
    const hasName   = !!(raw.Customer_Name ?? raw.customer_name ?? raw.name);
    const isSuccess = SUCCESS_VALUES.has(s) || hasName;

    logger.info("legitdataway_meter_verify_response", {
      status:        raw.status,
      Status:        raw.Status,
      customer_name: hasName ? "[present]" : "[absent]",
      message:       raw.message,
    });

    if (!isSuccess) {
      return {
        success:       false,
        customer_name: "",
        meter_number:  input.meter_number,
        message:       raw.message ?? raw.detail ?? "Meter verification failed",
        raw_response:  raw,
      };
    }

    return {
      success:       true,
      customer_name: raw.Customer_Name ?? raw.customer_name ?? raw.name ?? "",
      address:       raw.Address ?? raw.address,
      meter_number:  raw.Meter_Number ?? raw.meter_number ?? input.meter_number,
      message:       raw.message ?? "Meter verified successfully",
      raw_response:  raw,
    };
  }

  private async purchaseElectricity(
    input: ProviderPurchaseInput,
  ): Promise<ProviderPurchaseResult> {
    const { token, baseUrl, username, password } = await this.resolveAuth();

    const discoName = input.provider_variation_code ?? null;
    if (!discoName) {
      throw new Error(
        "LegitDataWay electricity: disco ID (Provider Variation Code) is missing. " +
        "Go to Admin → Service Plans, find this electricity plan, and set " +
        "'Provider Variation Code' to the numeric LegitDataWay disco ID (e.g. 1 for Ikeja).",
      );
    }

    const discoId = parseInt(discoName, 10);
    if (isNaN(discoId) || discoId <= 0) {
      throw new Error(
        `LegitDataWay electricity: disco ID '${discoName}' is not a valid integer. ` +
        "Go to Admin → Service Plans and set 'Provider Variation Code' to the numeric LegitDataWay disco ID.",
      );
    }

    const meterType = input.plan_category ?? "prepaid";

    const payload = {
      disco:        discoId,
      amount:       input.amount,
      meter_number: input.meter_number ?? "",
      meter_type:   meterType,
      bypass:       false,
      "request-id": input.reference,
    };

    logger.info("legitdataway_electricity_request", {
      disco:     discoId,
      meter_type: meterType,
      amount:     input.amount,
      meter:      maskPhone(input.meter_number),
      reference:  input.reference,
    });

    let response = await this.fetchWithTimeout(`${baseUrl}/api/bill`, {
      method:  "POST",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      const newToken = await this.refreshOrThrowValidation(response, "electricity", username, password, baseUrl);
      response = await this.fetchWithTimeout(`${baseUrl}/api/bill`, {
        method:  "POST",
        headers: { "Authorization": `Token ${newToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await this.readErrorBody(response);
      throw new Error(
        `LegitDataWay electricity: HTTP ${response.status} even after token refresh${detail}. ` +
        `Verify account credentials and that electricity service is enabled.`,
      );
    }

    const raw     = await this.parseJson<LDWElectricityResponse>(response, "electricity purchase");
    const success = isSuccessStatus(raw);

    logger.info("legitdataway_electricity_response", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      token:     raw.token ? "[present]" : "[absent]",
      success,
      reference: input.reference,
    });

    return {
      success,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (success ? "Electricity purchase successful" : "Electricity purchase failed"),
      status:             success ? "successful" : "failed",
      raw_response: {
        status:         raw.status,
        Status:         raw.Status,
        message:        raw.message,
        token:          raw.token,
        units:          raw.units,
        api_response:   raw.api_response,
        balance_before: raw.balance_before,
        balance_after:  raw.balance_after,
      },
    };
  }

  // ── Cable TV ──────────────────────────────────────────────────────────────

  async verifyCable(input: CableVerifyInput): Promise<CableVerifyResult> {
    const { token, baseUrl, username, password } = await this.resolveAuth();

    if (!input.biller_code) {
      throw new Error(
        "LegitDataWay cable: biller_code is missing. " +
        "Ensure the plan has a network_operator set (e.g. dstv, gotv, startimes).",
      );
    }

    const cableId = CABLE_ID_MAP[input.biller_code.toLowerCase()];
    if (cableId === undefined) {
      throw new Error(
        `LegitDataWay cable verify: unrecognised biller '${input.biller_code}'. ` +
        `Supported: ${Object.keys(CABLE_ID_MAP).join(", ")}`,
      );
    }

    const params = new URLSearchParams({
      iuc:   input.smartcard_number ?? "",
      cable: String(cableId),
    });

    logger.info("legitdataway_cable_verify_request", {
      biller:    input.biller_code,
      cable_id:  cableId,
      smartcard: maskPhone(input.smartcard_number),
    });

    let response = await this.fetchWithTimeout(
      `${baseUrl}/api/cable/cable-validation?${params}`,
      { method: "GET", headers: { "Authorization": `Token ${token}` } },
    );

    if (response.status === 401 || response.status === 403) {
      const newToken = await this.refreshOrThrowValidation(response, "cable verify", username, password, baseUrl);
      response = await this.fetchWithTimeout(
        `${baseUrl}/api/cable/cable-validation?${params}`,
        { method: "GET", headers: { "Authorization": `Token ${newToken}` } },
      );
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await this.readErrorBody(response);
      throw new Error(
        `LegitDataWay cable verify: HTTP ${response.status} even after token refresh${detail}. ` +
        `Verify account credentials.`,
      );
    }

    const raw     = await this.parseJson<LDWCableValidationResponse>(response, "cable verify");
    const s       = (raw.status ?? raw.Status ?? "").toLowerCase();
    const hasName = !!(raw.Customer_Name ?? raw.customer_name ?? raw.name);
    const isSuccess = SUCCESS_VALUES.has(s) || hasName;

    logger.info("legitdataway_cable_verify_response", {
      status:        raw.status,
      Status:        raw.Status,
      customer_name: hasName ? "[present]" : "[absent]",
      message:       raw.message,
    });

    if (!isSuccess) {
      return {
        success:      false,
        message:      raw.message ?? raw.detail ?? "Decoder verification failed",
        raw_response: raw,
      };
    }

    return {
      success:          true,
      customer_name:    raw.Customer_Name ?? raw.customer_name ?? raw.name ?? undefined,
      current_package:  raw.Current_Bouquet ?? raw.current_bouquet ?? raw.Bouquet ?? undefined,
      due_date:         raw.Due_Date ?? raw.due_date ?? undefined,
      smartcard_number: raw.Smartcard_Number ?? raw.smartcard_number ?? input.smartcard_number,
      message:          raw.message ?? "Decoder verified successfully",
      raw_response:     raw,
    };
  }

  private async purchaseCable(
    input: ProviderPurchaseInput,
  ): Promise<ProviderPurchaseResult> {
    const { token, baseUrl, username, password } = await this.resolveAuth();

    const billerCode = input.network_operator ?? null;
    if (!billerCode) {
      throw new Error(
        "LegitDataWay cable: biller code (network_operator) is missing. " +
        "Ensure the plan's network_operator is set (e.g. dstv, gotv, startimes).",
      );
    }

    const variationCode = input.provider_variation_code ?? input.variation_code ?? null;
    if (!variationCode) {
      throw new Error(
        "LegitDataWay cable: variation_code is missing for this plan. " +
        "Go to Admin → Service Plans, find this plan, and set " +
        "'Provider Variation Code' to the LegitDataWay variation code.",
      );
    }

    const payload = {
      cablename:         billerCode.toLowerCase(),
      cableplan:         variationCode,
      smart_card_number: input.smartcard_number ?? "",
      "request-id":      input.reference,
    };

    logger.info("legitdataway_cable_request", {
      cablename:  billerCode,
      cableplan:  variationCode,
      smartcard:  maskPhone(input.smartcard_number),
      reference:  input.reference,
    });

    let response = await this.fetchWithTimeout(`${baseUrl}/api/cable`, {
      method:  "POST",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      const newToken = await this.refreshOrThrowValidation(response, "cable", username, password, baseUrl);
      response = await this.fetchWithTimeout(`${baseUrl}/api/cable`, {
        method:  "POST",
        headers: { "Authorization": `Token ${newToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await this.readErrorBody(response);
      throw new Error(
        `LegitDataWay cable: HTTP ${response.status} even after token refresh${detail}. ` +
        `Verify account credentials and that cable TV service is enabled.`,
      );
    }

    const raw     = await this.parseJson<LDWCablePurchaseResponse>(response, "cable purchase");
    const success = isSuccessStatus(raw);

    logger.info("legitdataway_cable_response", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      success,
      reference: input.reference,
    });

    return {
      success,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (success ? "Cable TV subscription successful" : "Cable TV subscription failed"),
      status:             success ? "successful" : "failed",
      raw_response: {
        status:         raw.status,
        Status:         raw.Status,
        message:        raw.message,
        Customer_Name:  raw.Customer_Name ?? raw.customer_name,
        package:        raw.Package ?? raw.package ?? raw.Bouquet ?? raw.bouquet,
        Due_Date:       raw.Due_Date ?? raw.due_date,
        api_response:   raw.api_response,
        balance_before: raw.balance_before,
        balance_after:  raw.balance_after,
      },
    };
  }

  // ── Exam Pins ─────────────────────────────────────────────────────────────

  private async purchaseExamPin(
    input: ProviderPurchaseInput,
  ): Promise<ProviderPurchaseResult> {
    const { token, baseUrl, username, password } = await this.resolveAuth();

    // exam_type: from provider_variation_code (e.g. "WAEC", "JAMB")
    // or derived from variation_code prefix (waec-pin-1 → "WAEC")
    const prefix   = extractPrefix(input.variation_code ?? "");
    const examType = input.provider_variation_code ?? prefix.toUpperCase();

    if (!examType) {
      throw new Error(
        "LegitDataWay exam_pin: exam type is missing. " +
        "Set 'Provider Variation Code' to the exam type (e.g. WAEC or JAMB) in Admin → Service Plans.",
      );
    }

    const payload = {
      exam_type: examType,
      phone:     input.phone ?? "",
    };

    logger.info("legitdataway_exam_request", {
      exam_type: examType,
      phone:     maskPhone(input.phone),
      reference: input.reference,
    });

    let response = await this.fetchWithTimeout(`${baseUrl}/api/exam`, {
      method:  "POST",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (response.status === 401 || response.status === 403) {
      const newToken = await this.refreshOrThrowValidation(response, "exam", username, password, baseUrl);
      response = await this.fetchWithTimeout(`${baseUrl}/api/exam`, {
        method:  "POST",
        headers: { "Authorization": `Token ${newToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
    }

    if (response.status === 401 || response.status === 403) {
      const detail = await this.readErrorBody(response);
      throw new Error(
        `LegitDataWay exam: HTTP ${response.status} even after token refresh${detail}. ` +
        `Verify account credentials and that exam pin service is enabled.`,
      );
    }

    const raw     = await this.parseJson<LDWExamResponse>(response, "exam pin");
    const success = isSuccessStatus(raw);

    logger.info("legitdataway_exam_response", {
      status:    raw.status,
      Status:    raw.Status,
      message:   raw.message,
      has_pin:   !!(raw.pin || (raw.pins?.length ?? 0) > 0 || (raw.carddetails?.length ?? 0) > 0),
      success,
      reference: input.reference,
    });

    return {
      success,
      provider_reference: input.reference,
      provider:           this.name,
      message:            raw.message ?? (success ? "Exam pin purchase successful" : "Exam pin purchase failed"),
      status:             success ? "successful" : "failed",
      raw_response: {
        status:       raw.status,
        Status:       raw.Status,
        message:      raw.message,
        pin:          raw.pin,
        pins:         raw.pins,
        carddetails:  raw.carddetails,
        api_response: raw.api_response,
      },
    };
  }

  // ── Plan listing ─────────────────────────────────────────────────────────
  //
  // LegitDataWay does not publish a plan-list endpoint in their docs.
  // We try GET /api/plans (with optional ?network=<id>) which matches patterns
  // common among Nigerian VTU resellers that share the same backend stack.
  // Cable TV plans are returned as a hardcoded list because there is no
  // documented API endpoint for them — the codes are standardised.

  async fetchPlans(
    serviceType: "data" | "cable_tv" | "electricity",
    network?:    string,
  ): Promise<Array<Record<string, unknown>>> {
    if (serviceType === "cable_tv") {
      return CABLE_TV_PLAN_LIST;
    }

    if (serviceType === "electricity") {
      return ELECTRICITY_DISCO_LIST;
    }

    // data — LegitDataWay has no documented plan-list API endpoint.
    // Plans are sourced from their dashboard docs page and stored in DATA_PLAN_LIST.
    const plans = network
      ? DATA_PLAN_LIST.filter((p) => String(p.network).toLowerCase() === network.toLowerCase())
      : DATA_PLAN_LIST;

    if (plans.length === 0 && network) {
      const available = [...new Set(DATA_PLAN_LIST.map((p) => p.network))].join(", ");
      throw new Error(
        `No plans available for network '${network}' in the hardcoded list. ` +
        `Available networks: ${available}.`,
      );
    }

    return plans;
  }

  // ── Balance ───────────────────────────────────────────────────────────────

  async getBalance(): Promise<ProviderBalance> {
    const creds   = await this.requireCredentials();
    const username = (creds.username_encrypted ?? "").trim();
    const password = (creds.password_encrypted ?? "").trim();
    const baseUrl  = (creds.base_url ?? "").trim().replace(/\/$/, "") || LDW_DEFAULT_BASE_URL;

    if (!username || !password) {
      throw new Error("LegitDataWay: username or password not set — add in Admin > API Integrations > LegitDataWay");
    }

    // The /api/user token endpoint returns balance alongside the access token
    const raw      = await this.callTokenEndpoint(username, password, baseUrl);
    const token    = this.extractToken(raw);
    await this.storeToken(token);

    const rawBalance = raw.balance;
    if (rawBalance === undefined || rawBalance === null) {
      throw new Error("LegitDataWay: balance field not present in token response");
    }

    const balance = parseFloat(String(rawBalance).replace(/,/g, ""));
    if (isNaN(balance)) {
      throw new Error(`LegitDataWay: cannot parse balance value "${rawBalance}"`);
    }

    logger.info("legitdataway_balance_parsed", { balance_raw: rawBalance, balance });

    return { available: balance, currency: "NGN", raw_response: raw };
  }

  // ── Transaction verify ────────────────────────────────────────────────────

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    logger.warn("legitdataway_verify_transaction_not_available", { reference });
    return {
      found:   false,
      status:  "pending",
      message: "LegitDataWay does not expose a transaction query endpoint — check LegitDataWay dashboard",
    };
  }

  // ── Health check ──────────────────────────────────────────────────────────
  //
  // Validates credentials by performing a live token generation against /api/user.
  // On success the fresh token is cached in bearer_token_encrypted for reuse.

  async healthCheck(): Promise<ProviderHealthResult> {
    const creds = await getProviderCredentials(this.name);

    if (!creds) {
      return {
        healthy: false,
        message: "LegitDataWay credentials not configured — add username and password in Admin > API Integrations",
      };
    }
    if (!creds.username_encrypted) {
      return {
        healthy: false,
        message: "LegitDataWay username not set — add in Admin > API Integrations > LegitDataWay",
      };
    }
    if (!creds.password_encrypted) {
      return {
        healthy: false,
        message: "LegitDataWay password not set — add in Admin > API Integrations > LegitDataWay",
      };
    }

    try {
      const username = creds.username_encrypted.trim();
      const password = creds.password_encrypted.trim();
      const baseUrl  = (creds.base_url ?? "").trim().replace(/\/$/, "") || LDW_DEFAULT_BASE_URL;

      const start   = Date.now();
      // Use a 15 s timeout so the backend always responds well within the
      // frontend axios 30 s window, even if the provider is slow.
      const raw     = await this.callTokenEndpoint(username, password, baseUrl, 15_000);
      const token   = this.extractToken(raw);
      const latency = Date.now() - start;

      await this.storeToken(token);

      // Include balance in the health message when the token endpoint provides it
      const rawBalance = raw.balance;
      const balance    = rawBalance !== undefined && rawBalance !== null
        ? parseFloat(String(rawBalance).replace(/,/g, ""))
        : NaN;

      const balanceStr = !isNaN(balance)
        ? ` — Balance: ₦${balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
        : "";

      return {
        healthy:    true,
        latency_ms: latency,
        message:    `LegitDataWay credentials valid${balanceStr}`,
      };
    } catch (err) {
      return {
        healthy: false,
        message: `LegitDataWay health check failed: ${(err as Error).message}`,
      };
    }
  }
}
