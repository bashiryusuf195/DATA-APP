// src/modules/auth/repositories/admin-user.repository.ts
// Data access layer for the admin users endpoints.
// All queries are read-only; mutations are out of scope for this module.

import { getDbInstance } from "../../../db/knex";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminUserListOptions {
  limit:   number;
  offset:  number;
  email?:  string;
  status?: string;
  role?:   string;
}

export interface AdminUserListRow {
  id:                string;
  email:             string;
  full_name:         string | null;
  status:            string;
  kyc_level:         string;
  is_email_verified: boolean;
  last_login_at:     string | null;
  created_at:        string;
}

export interface UserRoleRow {
  user_id: string;
  role:    string;
}

export interface UserWalletSummaryRow {
  user_id:   string;
  wallet_id: string;
  currency:  string;
  balance:   string; // pg numeric comes back as string — service casts to Number
}

export interface AdminUserDetail {
  id:                  string;
  email:               string;
  phone:               string | null;
  username:            string | null;
  status:              string;
  kyc_level:           string;
  is_email_verified:   boolean;
  is_phone_verified:   boolean;
  last_login_at:       string | null;
  login_count:         number;
  created_at:          string;
  updated_at:          string;
  // joined from user_profiles
  first_name:          string | null;
  last_name:           string | null;
  display_name:        string | null;
  avatar_url:          string | null;
  date_of_birth:       string | null;
  gender:              string | null;
  city:                string | null;
  state:               string | null;
  country:             string | null;
  bvn_verified:        boolean;
  nin_verified:        boolean;
}

export interface UserWalletRow {
  wallet_id:   string;
  wallet_type: string;
  currency:    string;
  status:      string;
  is_default:  boolean;
  label:       string | null;
  balance:     string; // pg numeric
  created_at:  string;
}

export interface UserTransactionRow {
  id:         string;
  reference:  string;
  type:       string;
  status:     string;
  amount:     string; // pg numeric
  currency:   string;
  provider:   string | null;
  created_at: string;
}

export interface UserRoleDetailRow {
  role:        string;
  name:        string;
  assigned_at: string;
  expires_at:  string | null;
}

export interface UserSessionRow {
  id:         string;
  ip_address: string | null;
  user_agent: string | null;
  is_revoked: boolean;
  expires_at: string;
  created_at: string;
}

export interface UserNotificationCountRow {
  total:  string; // pg COUNT returns string
  unread: string;
}

// ── List helpers ──────────────────────────────────────────────────────────────

/**
 * Reusable filter builder applied to both the count query and the data query.
 * Uses whereExists for the role filter to avoid row-multiplication from JOINs.
 */
function applyListFilters(
  query: ReturnType<ReturnType<typeof getDbInstance>>,
  opts: AdminUserListOptions,
): void {
  const db = getDbInstance();

  query.whereNull("u.deleted_at");

  if (opts.email) {
    query.where("u.email", "ilike", `%${opts.email}%`);
  }
  if (opts.status) {
    query.where("u.status", opts.status);
  }
  if (opts.role) {
    query.whereExists(
      db("user_roles as ur")
        .join("roles as r", "r.id", "ur.role_id")
        .whereRaw("ur.user_id = u.id")
        .where("r.slug", opts.role)
        .where(function () {
          this.whereNull("ur.expires_at").orWhere(
            "ur.expires_at",
            ">",
            db.fn.now(),
          );
        })
        .select(db.raw("1")),
    );
  }
}

// ── Count ─────────────────────────────────────────────────────────────────────

export async function countAdminUsers(
  opts: AdminUserListOptions,
): Promise<number> {
  const db = getDbInstance();

  const query = db("users as u");
  applyListFilters(query, opts);

  const result = await query.countDistinct("u.id as count").first<{ count: string }>();
  return Number(result?.count ?? 0);
}

// ── Paginated list ────────────────────────────────────────────────────────────

export async function fetchAdminUserList(
  opts: AdminUserListOptions,
): Promise<AdminUserListRow[]> {
  const db = getDbInstance();

  const query = db("users as u").leftJoin(
    "user_profiles as p",
    "p.user_id",
    "u.id",
  );
  applyListFilters(query, opts);

  return query
    .select([
      "u.id",
      "u.email",
      "u.status",
      "u.kyc_level",
      "u.is_email_verified",
      "u.last_login_at",
      "u.created_at",
      db.raw(
        `NULLIF(TRIM(COALESCE(
          p.first_name || ' ' || p.last_name,
          p.first_name,
          p.last_name,
          ''
        )), '') AS full_name`,
      ),
    ])
    .orderBy("u.created_at", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
}

// ── Roles for a set of users ──────────────────────────────────────────────────

export async function fetchUserRolesBatch(
  userIds: string[],
): Promise<UserRoleRow[]> {
  if (userIds.length === 0) return [];
  const db = getDbInstance();

  return db("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .whereIn("ur.user_id", userIds)
    .where("r.is_active", true)
    .where(function () {
      this.whereNull("ur.expires_at").orWhere(
        "ur.expires_at",
        ">",
        db.fn.now(),
      );
    })
    .select(["ur.user_id", "r.slug as role"]);
}

// ── Default wallet balance for a set of users ─────────────────────────────────
// Uses a derived subquery instead of the v_wallet_balances view so we can
// filter to only the user IDs we care about rather than scanning all ledger rows.

export async function fetchUserWalletSummariesBatch(
  userIds: string[],
): Promise<UserWalletSummaryRow[]> {
  if (userIds.length === 0) return [];
  const db = getDbInstance();

  return db("wallets as w")
    .leftJoin(
      db.raw(
        `(
          SELECT wallet_id, COALESCE(SUM(signed_amount), 0) AS balance
          FROM   wallet_ledger
          GROUP  BY wallet_id
        ) AS wl`,
      ),
      "wl.wallet_id",
      "w.id",
    )
    .whereIn("w.user_id", userIds)
    .where("w.wallet_type", "user")
    .where("w.is_default", true)
    .select([
      "w.user_id",
      "w.id as wallet_id",
      "w.currency",
      db.raw("COALESCE(wl.balance, 0) AS balance"),
    ]);
}

// ── Single-user detail ────────────────────────────────────────────────────────

export async function fetchAdminUserById(
  id: string,
): Promise<AdminUserDetail | null> {
  const db = getDbInstance();

  const row = await db("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .where("u.id", id)
    .whereNull("u.deleted_at")
    .select([
      "u.id",
      "u.email",
      "u.phone",
      "u.username",
      "u.status",
      "u.kyc_level",
      "u.is_email_verified",
      "u.is_phone_verified",
      "u.last_login_at",
      "u.login_count",
      "u.created_at",
      "u.updated_at",
      "p.first_name",
      "p.last_name",
      "p.display_name",
      "p.avatar_url",
      "p.date_of_birth",
      "p.gender",
      "p.city",
      "p.state",
      "p.country",
      "p.bvn_verified",
      "p.nin_verified",
    ])
    .first<AdminUserDetail>();

  return row ?? null;
}

export async function fetchUserWallets(id: string): Promise<UserWalletRow[]> {
  const db = getDbInstance();

  return db("wallets as w")
    .leftJoin(
      db.raw(
        `(
          SELECT wallet_id, COALESCE(SUM(signed_amount), 0) AS balance
          FROM   wallet_ledger
          GROUP  BY wallet_id
        ) AS wl`,
      ),
      "wl.wallet_id",
      "w.id",
    )
    .where("w.user_id", id)
    .select([
      "w.id as wallet_id",
      "w.wallet_type",
      "w.currency",
      "w.status",
      "w.is_default",
      "w.label",
      "w.created_at",
      db.raw("COALESCE(wl.balance, 0) AS balance"),
    ])
    .orderBy([
      { column: "w.is_default", order: "desc" },
      { column: "w.created_at", order: "asc" },
    ]);
}

export async function fetchUserRecentTransactions(
  id: string,
  limit = 10,
): Promise<UserTransactionRow[]> {
  const db = getDbInstance();

  return db("transactions")
    .where("user_id", id)
    .select([
      "id",
      "reference",
      "type",
      "status",
      "amount",
      "currency",
      "provider",
      "created_at",
    ])
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function fetchUserRoles(id: string): Promise<UserRoleDetailRow[]> {
  const db = getDbInstance();

  return db("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .where("ur.user_id", id)
    .where("r.is_active", true)
    .where(function () {
      this.whereNull("ur.expires_at").orWhere(
        "ur.expires_at",
        ">",
        db.fn.now(),
      );
    })
    .select([
      "r.slug as role",
      "r.name",
      "ur.assigned_at",
      "ur.expires_at",
    ]);
}

export async function fetchUserSessions(
  id: string,
  limit = 5,
): Promise<UserSessionRow[]> {
  const db = getDbInstance();

  return db("sessions")
    .where("user_id", id)
    .select([
      "id",
      "ip_address",
      "user_agent",
      "is_revoked",
      "expires_at",
      "created_at",
    ])
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function fetchUserNotificationCount(
  id: string,
): Promise<{ total: number; unread: number }> {
  const db = getDbInstance();

  const row = await db("notifications")
    .where("user_id", id)
    .select([
      db.raw("COUNT(*) AS total"),
      db.raw("COUNT(*) FILTER (WHERE read_at IS NULL) AS unread"),
    ])
    .first<{ total: string; unread: string }>();

  return {
    total:  Number(row?.total  ?? 0),
    unread: Number(row?.unread ?? 0),
  };
}
