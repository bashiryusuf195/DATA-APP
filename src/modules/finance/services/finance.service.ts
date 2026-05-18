import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

function range(from?: string, to?: string) {
  const toDate   = to   ? new Date(to)   : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return { fromDate, toDate };
}

function parseNumbers(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "string" && !isNaN(Number(v)) ? parseFloat(v) : v;
  }
  return out;
}

// Active transactions table schema (20260514211000):
//   type VARCHAR(50)       — not transaction_type/service_type
//   provider VARCHAR(100)  — string, not provider_id UUID FK
//   source_wallet_id / destination_wallet_id  — not wallet_id
//   no fee column
//   status VARCHAR(30)

export async function getRevenueSummary(from?: string, to?: string) {
  const { fromDate, toDate } = range(from, to);

  try {
    const [summary] = await db("transactions")
      .whereBetween("created_at", [fromDate, toDate])
      .select(
        db.raw("COUNT(*)::int                                              AS total_transactions"),
        db.raw("COUNT(*) FILTER (WHERE status = 'successful')::int        AS successful_count"),
        db.raw("COUNT(*) FILTER (WHERE status = 'failed')::int            AS failed_count"),
        db.raw("COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS pending_count"),
        db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'successful'), 0) AS total_volume"),
        db.raw("0::numeric                                                  AS total_fees"),
        db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'successful'), 0) AS net_volume"),
      );

    const byService = await db("transactions")
      .whereBetween("created_at", [fromDate, toDate])
      .where("status", "successful")
      .groupBy(db.raw("COALESCE(type, 'other')"))
      .select(
        db.raw("COALESCE(type, 'other') AS service"),
        db.raw("COUNT(*)::int AS count"),
        db.raw("COALESCE(SUM(amount), 0) AS volume"),
        db.raw("0::numeric AS fees"),
      );

    const dailyTrend = await db("transactions")
      .whereBetween("created_at", [fromDate, toDate])
      .groupByRaw("DATE(created_at)")
      .orderByRaw("DATE(created_at) ASC")
      .select(
        db.raw("DATE(created_at) AS date"),
        db.raw("COUNT(*)::int AS total"),
        db.raw("COUNT(*) FILTER (WHERE status = 'successful')::int AS successful"),
        db.raw("COUNT(*) FILTER (WHERE status = 'failed')::int    AS failed"),
        db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'successful'), 0) AS volume"),
        db.raw("0::numeric AS fees"),
      );

    return {
      summary:    parseNumbers(summary as Record<string, unknown>),
      byService:  (byService as Record<string, unknown>[]).map(parseNumbers),
      dailyTrend: (dailyTrend as Record<string, unknown>[]).map(parseNumbers),
      period:     { from: fromDate.toISOString(), to: toDate.toISOString() },
    };
  } catch {
    return {
      summary:    { total_transactions: 0, successful_count: 0, failed_count: 0, pending_count: 0, total_volume: 0, total_fees: 0, net_volume: 0 },
      byService:  [],
      dailyTrend: [],
      period:     { from: fromDate.toISOString(), to: toDate.toISOString() },
    };
  }
}

export async function getProviderBalances(from?: string, to?: string) {
  const { fromDate, toDate } = range(from, to);

  try {
    const rows = await db("transactions as t")
      .leftJoin("providers as p", "t.provider", "p.provider_code")
      .whereBetween("t.created_at", [fromDate, toDate])
      .whereNotNull("t.provider")
      .groupBy("t.provider", "p.display_name", "p.is_active")
      .orderByRaw("SUM(t.amount) FILTER (WHERE t.status = 'successful') DESC NULLS LAST")
      .select(
        db.raw("t.provider                                                        AS provider_code"),
        db.raw("COALESCE(p.display_name, t.provider)                             AS display_name"),
        db.raw("COALESCE(p.is_active, true)                                      AS is_active"),
        db.raw("COUNT(*)::int                                                     AS total_transactions"),
        db.raw("COUNT(*) FILTER (WHERE t.status = 'successful')::int             AS successful_count"),
        db.raw("COUNT(*) FILTER (WHERE t.status = 'failed')::int                 AS failed_count"),
        db.raw("COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'successful'), 0) AS volume_processed"),
        db.raw("0::numeric                                                         AS fees_generated"),
        db.raw(
          "ROUND(100.0 * COUNT(*) FILTER (WHERE t.status = 'successful') / NULLIF(COUNT(*),0), 2) AS success_rate",
        ),
      );

    return (rows as Record<string, unknown>[]).map(parseNumbers);
  } catch {
    return [];
  }
}

export async function getProfitAnalysis(from?: string, to?: string) {
  const { fromDate, toDate } = range(from, to);

  try {
    const [totals] = await db("transactions")
      .whereBetween("created_at", [fromDate, toDate])
      .where("status", "successful")
      .select(
        db.raw("0::numeric                            AS gross_revenue"),
        db.raw("COALESCE(SUM(amount), 0)              AS total_gmv"),
        db.raw("COUNT(*)::int                         AS transaction_count"),
        db.raw("0::numeric                            AS avg_fee"),
        db.raw("COALESCE(AVG(amount), 0)              AS avg_transaction_value"),
      );

    const byService = await db("transactions")
      .whereBetween("created_at", [fromDate, toDate])
      .where("status", "successful")
      .groupBy(db.raw("COALESCE(type, 'other')"))
      .orderByRaw("SUM(amount) DESC")
      .select(
        db.raw("COALESCE(type, 'other') AS service"),
        db.raw("COUNT(*)::int           AS count"),
        db.raw("COALESCE(SUM(amount), 0) AS volume"),
        db.raw("0::numeric               AS revenue"),
        db.raw("0::numeric               AS margin_pct"),
      );

    const weeklyTrend = await db("transactions")
      .whereBetween("created_at", [fromDate, toDate])
      .where("status", "successful")
      .groupByRaw("DATE_TRUNC('week', created_at)")
      .orderByRaw("DATE_TRUNC('week', created_at) ASC")
      .select(
        db.raw("DATE_TRUNC('week', created_at) AS week"),
        db.raw("COUNT(*)::int                   AS count"),
        db.raw("COALESCE(SUM(amount), 0)        AS volume"),
        db.raw("0::numeric                      AS revenue"),
      );

    return {
      totals:      parseNumbers(totals as Record<string, unknown>),
      byService:   (byService as Record<string, unknown>[]).map(parseNumbers),
      weeklyTrend: (weeklyTrend as Record<string, unknown>[]).map(parseNumbers),
      period:      { from: fromDate.toISOString(), to: toDate.toISOString() },
    };
  } catch {
    return {
      totals:      { gross_revenue: 0, total_gmv: 0, transaction_count: 0, avg_fee: 0, avg_transaction_value: 0 },
      byService:   [],
      weeklyTrend: [],
      period:      { from: fromDate.toISOString(), to: toDate.toISOString() },
    };
  }
}

export async function listRefunds(filters: {
  status?:  string;
  search?:  string;
  page?:    number;
  limit?:   number;
}) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("refunds as r")
    .leftJoin("transactions as t", "t.id", "r.transaction_id")
    .modify((q) => {
      if (filters.status) q.where("r.status", filters.status);
      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("r.reason ILIKE ?",            [term])
            .orWhereRaw("t.reference ILIKE ?",         [term])
            .orWhereRaw("r.id::text ILIKE ?",          [term]);
        });
      }
    });

  const [{ count }] = await base.clone().count<{ count: string }[]>("r.id as count");
  const rows = await base
    .clone()
    .orderBy("r.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "r.*",
      db.raw("t.reference AS transaction_reference"),
      db.raw("t.amount    AS transaction_amount"),
      db.raw("t.status    AS transaction_status"),
    );

  return { data: rows, total: parseInt(count, 10), page, limit };
}

export async function listReversals(filters: {
  status?:  string;
  search?:  string;
  page?:    number;
  limit?:   number;
}) {
  const page   = Math.max(1, filters.page  ?? 1);
  const limit  = Math.min(100, Math.max(1, filters.limit ?? 25));
  const offset = (page - 1) * limit;

  const base = db("reversals as r")
    .leftJoin("transactions as t", "t.id", "r.transaction_id")
    .modify((q) => {
      if (filters.status) q.where("r.status", filters.status);
      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where(function () {
          this.whereRaw("r.reason ILIKE ?",            [term])
            .orWhereRaw("t.reference ILIKE ?",         [term])
            .orWhereRaw("r.id::text ILIKE ?",          [term]);
        });
      }
    });

  const [{ count }] = await base.clone().count<{ count: string }[]>("r.id as count");
  const rows = await base
    .clone()
    .orderBy("r.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "r.*",
      db.raw("t.reference AS transaction_reference"),
      db.raw("t.amount    AS transaction_amount"),
      db.raw("t.status    AS transaction_status"),
    );

  return { data: rows, total: parseInt(count, 10), page, limit };
}
