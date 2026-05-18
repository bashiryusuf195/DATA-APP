import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export interface DashboardMetrics {
  users: {
    total: number;
    active: number;
    suspended: number;
    new_today: number;
  };
  wallets: {
    total: number;
    total_balance: number;
  };
  transactions: {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    total_volume: number;
    purchase_volume: number;
    today_count: number;
    today_successful_volume: number;
    recent_failed_24h: number;
  };
  funding: {
    total_volume: number;
    total_count: number;
    successful_count: number;
  };
  providers: {
    overall_success_rate: number;
    total_attempts: number;
  };
  refunds: {
    total: number;
    total_amount: number;
  };
  support: {
    open_tickets: number;
    pending_tickets: number;
  };
  generated_at: string;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

  const [
    userStats,
    walletStats,
    txStats,
    txToday,
    fundingStats,
    providerStats,
    refundStats,
    supportStats,
  ] = await Promise.all([
    // ── Users ──────────────────────────────────────────────────────────────────
    db("users")
      .select(
        db.raw("COUNT(*)::int                                             AS total"),
        db.raw("COUNT(*) FILTER (WHERE status = 'active')::int           AS active"),
        db.raw("COUNT(*) FILTER (WHERE status = 'suspended')::int        AS suspended"),
        db.raw("COUNT(*) FILTER (WHERE created_at >= ?)::int             AS new_today", [todayStart]),
      )
      .first<{ total: unknown; active: unknown; suspended: unknown; new_today: unknown }>(),

    // ── Wallets (user wallets only, balance from v_wallet_balances view) ───────
    db("v_wallet_balances")
      .whereNotNull("user_id")
      .where("wallet_type", "user")
      .select(
        db.raw("COUNT(*)::int                             AS total_wallets"),
        db.raw("COALESCE(SUM(balance), 0)::numeric       AS total_balance"),
      )
      .first<{ total_wallets: unknown; total_balance: unknown }>()
      .catch(() => ({ total_wallets: 0, total_balance: 0 })),

    // ── Transactions (all-time aggregates) ────────────────────────────────────
    db("transactions")
      .select(
        db.raw("COUNT(*)::int                                                                                         AS total"),
        db.raw("COUNT(*) FILTER (WHERE status = 'successful')::int                                                   AS successful"),
        db.raw("COUNT(*) FILTER (WHERE status = 'failed')::int                                                       AS failed"),
        db.raw("COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int                                      AS pending"),
        db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'successful'), 0)                                        AS total_volume"),
        db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'successful' AND type NOT IN ('wallet_funding','wallet_transfer')), 0) AS purchase_volume"),
        db.raw("COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ?)::int                                   AS recent_failed", [last24h]),
      )
      .first<{
        total: unknown; successful: unknown; failed: unknown; pending: unknown;
        total_volume: unknown; purchase_volume: unknown; recent_failed: unknown;
      }>(),

    // ── Transactions (today only) ─────────────────────────────────────────────
    db("transactions")
      .where("created_at", ">=", todayStart)
      .select(
        db.raw("COUNT(*)::int                                                      AS today_count"),
        db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'successful'), 0)     AS today_volume"),
      )
      .first<{ today_count: unknown; today_volume: unknown }>(),

    // ── Funding transactions ──────────────────────────────────────────────────
    db("funding_transactions")
      .select(
        db.raw("COUNT(*)::int                                                      AS total_count"),
        db.raw("COUNT(*) FILTER (WHERE status = 'successful')::int                AS successful_count"),
        db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'successful'), 0)     AS total_volume"),
      )
      .first<{ total_count: unknown; successful_count: unknown; total_volume: unknown }>()
      .catch(() => ({ total_count: 0, successful_count: 0, total_volume: 0 })),

    // ── Provider attempts (last 7 days — rate is rolling window, not all-time) ─
    db("provider_attempts")
      .where("created_at", ">=", last7d)
      .select(
        db.raw("COUNT(*)::int                                                                              AS total_attempts"),
        db.raw("ROUND(COUNT(*) FILTER (WHERE success = true)::numeric / NULLIF(COUNT(*), 0) * 100, 2)    AS success_rate"),
      )
      .first<{ total_attempts: unknown; success_rate: unknown }>()
      .catch(() => ({ total_attempts: 0, success_rate: 0 })),

    // ── Refunds ───────────────────────────────────────────────────────────────
    db("refunds")
      .select(
        db.raw("COUNT(*)::int                           AS total"),
        db.raw("COALESCE(SUM(amount), 0)                AS total_amount"),
      )
      .first<{ total: unknown; total_amount: unknown }>()
      .catch(() => ({ total: 0, total_amount: 0 })),

    // ── Support tickets ───────────────────────────────────────────────────────
    db("support_tickets")
      .select(
        db.raw("COUNT(*) FILTER (WHERE status = 'open')::int    AS open_count"),
        db.raw("COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count"),
      )
      .first<{ open_count: unknown; pending_count: unknown }>()
      .catch(() => ({ open_count: 0, pending_count: 0 })),
  ]);

  return {
    users: {
      total:     toNum(userStats?.total     ?? 0),
      active:    toNum(userStats?.active    ?? 0),
      suspended: toNum(userStats?.suspended ?? 0),
      new_today: toNum(userStats?.new_today ?? 0),
    },
    wallets: {
      total:         toNum(walletStats?.total_wallets ?? 0),
      total_balance: toNum(walletStats?.total_balance ?? 0),
    },
    transactions: {
      total:                   toNum(txStats?.total          ?? 0),
      successful:              toNum(txStats?.successful     ?? 0),
      failed:                  toNum(txStats?.failed         ?? 0),
      pending:                 toNum(txStats?.pending        ?? 0),
      total_volume:            toNum(txStats?.total_volume   ?? 0),
      purchase_volume:         toNum(txStats?.purchase_volume ?? 0),
      today_count:             toNum(txToday?.today_count    ?? 0),
      today_successful_volume: toNum(txToday?.today_volume   ?? 0),
      recent_failed_24h:       toNum(txStats?.recent_failed  ?? 0),
    },
    funding: {
      total_volume:     toNum(fundingStats?.total_volume     ?? 0),
      total_count:      toNum(fundingStats?.total_count      ?? 0),
      successful_count: toNum(fundingStats?.successful_count ?? 0),
    },
    providers: {
      overall_success_rate: toNum(providerStats?.success_rate    ?? 0),
      total_attempts:       toNum(providerStats?.total_attempts  ?? 0),
    },
    refunds: {
      total:        toNum(refundStats?.total        ?? 0),
      total_amount: toNum(refundStats?.total_amount ?? 0),
    },
    support: {
      open_tickets:    toNum(supportStats?.open_count    ?? 0),
      pending_tickets: toNum(supportStats?.pending_count ?? 0),
    },
    generated_at: new Date().toISOString(),
  };
}
