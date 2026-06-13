import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

// Service types that represent billable VTU purchases (excludes wallet ops,
// referral rewards, etc. which are not customer-facing purchase transactions).
const PURCHASE_TYPES = [
  "airtime",
  "data",
  "electricity",
  "cable_tv",
  "exam_pin",
  "identity_verification",
];

export interface ProfitSummary {
  revenue:  number;
  cost:     number;
  profit:   number;
  count:    number;
}

export interface ProfitDailyRow {
  date:    string;
  revenue: number;
  cost:    number;
  profit:  number;
  count:   number;
}

export interface ProfitServiceRow {
  service_type: string;
  revenue:      number;
  cost:         number;
  profit:       number;
  count:        number;
}

export interface ProfitProviderRow {
  provider_code: string;
  revenue:       number;
  cost:          number;
  profit:        number;
  count:         number;
}

export interface ProfitMonthRow {
  month:   string;
  revenue: number;
  cost:    number;
  profit:  number;
  count:   number;
}

export interface ProfitAnalyticsResult {
  selected_month:          string;
  today:                   ProfitSummary;
  month:                   ProfitSummary;
  all_time:                ProfitSummary & { missing_cost_price_count: number };
  daily_breakdown:         ProfitDailyRow[];
  service_breakdown:       ProfitServiceRow[];
  provider_breakdown:      ProfitProviderRow[];
  monthly_history:         ProfitMonthRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

function rowToSummary(row: Record<string, unknown>): ProfitSummary {
  return {
    revenue: toNum(row.revenue),
    cost:    toNum(row.cost),
    profit:  toNum(row.profit),
    count:   toNum(row.count),
  };
}

// ── Main analytics query ──────────────────────────────────────────────────────

export async function getProfitAnalytics(
  selectedMonth: string,        // "YYYY-MM"
): Promise<ProfitAnalyticsResult> {
  const [today, month, allTime, daily, byService, byProvider, history] =
    await Promise.all([
      queryTodayMetrics(),
      queryMonthMetrics(selectedMonth),
      queryAllTimeMetrics(),
      queryDailyBreakdown(selectedMonth),
      queryServiceBreakdown(selectedMonth),
      queryProviderBreakdown(selectedMonth),
      queryMonthlyHistory(),
    ]);

  return {
    selected_month:     selectedMonth,
    today:              rowToSummary(today),
    month:              rowToSummary(month),
    all_time: {
      ...rowToSummary(allTime),
      missing_cost_price_count: toNum(allTime.missing_cost),
    },
    daily_breakdown:    daily,
    service_breakdown:  byService,
    provider_breakdown: byProvider,
    monthly_history:    history,
  };
}

// ── Metric queries ────────────────────────────────────────────────────────────
//
// Revenue: COALESCE(selling_price_snapshot, amount)
//   • For new transactions: uses the immutable snapshot
//   • For legacy transactions without a snapshot: falls back to the recorded
//     debit amount (which equals the selling price)
//
// Cost / Profit: snapshot columns only — NULL for legacy transactions.
//   • missing_cost tells the dashboard how many rows have unknown cost.

async function queryTodayMetrics(): Promise<Record<string, unknown>> {
  const result = await db.raw<{ rows: Record<string, unknown>[] }>(`
    SELECT
      COALESCE(SUM(COALESCE(selling_price_snapshot, amount)), 0) AS revenue,
      COALESCE(SUM(cost_price_snapshot),  0) AS cost,
      COALESCE(SUM(profit_snapshot),      0) AS profit,
      COUNT(*)::int                          AS count
    FROM transactions
    WHERE status = 'successful'
      AND type = ANY(?)
      AND DATE(processed_at) = CURRENT_DATE
  `, [PURCHASE_TYPES]);
  return result.rows[0] ?? {};
}

async function queryMonthMetrics(month: string): Promise<Record<string, unknown>> {
  const result = await db.raw<{ rows: Record<string, unknown>[] }>(`
    SELECT
      COALESCE(SUM(COALESCE(selling_price_snapshot, amount)), 0) AS revenue,
      COALESCE(SUM(cost_price_snapshot),  0) AS cost,
      COALESCE(SUM(profit_snapshot),      0) AS profit,
      COUNT(*)::int                          AS count
    FROM transactions
    WHERE status = 'successful'
      AND type = ANY(?)
      AND TO_CHAR(processed_at, 'YYYY-MM') = ?
  `, [PURCHASE_TYPES, month]);
  return result.rows[0] ?? {};
}

async function queryAllTimeMetrics(): Promise<Record<string, unknown>> {
  const result = await db.raw<{ rows: Record<string, unknown>[] }>(`
    SELECT
      COALESCE(SUM(COALESCE(selling_price_snapshot, amount)), 0)  AS revenue,
      COALESCE(SUM(cost_price_snapshot),  0)                      AS cost,
      COALESCE(SUM(profit_snapshot),      0)                      AS profit,
      COUNT(*)::int                                               AS count,
      COUNT(*) FILTER (WHERE cost_price_snapshot IS NULL)::int    AS missing_cost
    FROM transactions
    WHERE status = 'successful'
      AND type = ANY(?)
  `, [PURCHASE_TYPES]);
  return result.rows[0] ?? {};
}

// ── Breakdown queries ─────────────────────────────────────────────────────────

async function queryDailyBreakdown(month: string): Promise<ProfitDailyRow[]> {
  const result = await db.raw<{ rows: Record<string, unknown>[] }>(`
    SELECT
      DATE(processed_at)::text                                    AS date,
      COALESCE(SUM(COALESCE(selling_price_snapshot, amount)), 0)  AS revenue,
      COALESCE(SUM(cost_price_snapshot),  0)                      AS cost,
      COALESCE(SUM(profit_snapshot),      0)                      AS profit,
      COUNT(*)::int                                               AS count
    FROM transactions
    WHERE status = 'successful'
      AND type = ANY(?)
      AND TO_CHAR(processed_at, 'YYYY-MM') = ?
    GROUP BY DATE(processed_at)
    ORDER BY date ASC
  `, [PURCHASE_TYPES, month]);

  return result.rows.map((r) => ({
    date:    String(r.date),
    revenue: toNum(r.revenue),
    cost:    toNum(r.cost),
    profit:  toNum(r.profit),
    count:   toNum(r.count),
  }));
}

async function queryServiceBreakdown(month: string): Promise<ProfitServiceRow[]> {
  const result = await db.raw<{ rows: Record<string, unknown>[] }>(`
    SELECT
      type                                                        AS service_type,
      COALESCE(SUM(COALESCE(selling_price_snapshot, amount)), 0)  AS revenue,
      COALESCE(SUM(cost_price_snapshot),  0)                      AS cost,
      COALESCE(SUM(profit_snapshot),      0)                      AS profit,
      COUNT(*)::int                                               AS count
    FROM transactions
    WHERE status = 'successful'
      AND type = ANY(?)
      AND TO_CHAR(processed_at, 'YYYY-MM') = ?
    GROUP BY type
    ORDER BY revenue DESC
  `, [PURCHASE_TYPES, month]);

  return result.rows.map((r) => ({
    service_type: String(r.service_type),
    revenue:      toNum(r.revenue),
    cost:         toNum(r.cost),
    profit:       toNum(r.profit),
    count:        toNum(r.count),
  }));
}

async function queryProviderBreakdown(month: string): Promise<ProfitProviderRow[]> {
  const result = await db.raw<{ rows: Record<string, unknown>[] }>(`
    SELECT
      COALESCE(provider, 'unknown')                               AS provider_code,
      COALESCE(SUM(COALESCE(selling_price_snapshot, amount)), 0)  AS revenue,
      COALESCE(SUM(cost_price_snapshot),  0)                      AS cost,
      COALESCE(SUM(profit_snapshot),      0)                      AS profit,
      COUNT(*)::int                                               AS count
    FROM transactions
    WHERE status = 'successful'
      AND type = ANY(?)
      AND TO_CHAR(processed_at, 'YYYY-MM') = ?
    GROUP BY COALESCE(provider, 'unknown')
    ORDER BY revenue DESC
  `, [PURCHASE_TYPES, month]);

  return result.rows.map((r) => ({
    provider_code: String(r.provider_code),
    revenue:       toNum(r.revenue),
    cost:          toNum(r.cost),
    profit:        toNum(r.profit),
    count:         toNum(r.count),
  }));
}

async function queryMonthlyHistory(): Promise<ProfitMonthRow[]> {
  // Return the last 13 complete months so the chart always has context.
  const result = await db.raw<{ rows: Record<string, unknown>[] }>(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', processed_at), 'YYYY-MM')      AS month,
      COALESCE(SUM(COALESCE(selling_price_snapshot, amount)), 0)  AS revenue,
      COALESCE(SUM(cost_price_snapshot),  0)                      AS cost,
      COALESCE(SUM(profit_snapshot),      0)                      AS profit,
      COUNT(*)::int                                               AS count
    FROM transactions
    WHERE status = 'successful'
      AND type = ANY(?)
      AND processed_at >= DATE_TRUNC('month', NOW()) - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', processed_at)
    ORDER BY month ASC
  `, [PURCHASE_TYPES]);

  return result.rows.map((r) => ({
    month:   String(r.month),
    revenue: toNum(r.revenue),
    cost:    toNum(r.cost),
    profit:  toNum(r.profit),
    count:   toNum(r.count),
  }));
}
