// src/modules/auth/services/admin-user.service.ts
// Business logic for GET /admin/users and GET /admin/users/:id.
// Orchestrates multiple repository calls and shapes the response.

import { NotFoundError } from "../../../lib/errors";
import {
  countAdminUsers,
  fetchAdminUserById,
  fetchAdminUserList,
  fetchUserNotificationCount,
  fetchUserRecentTransactions,
  fetchUserRoles,
  fetchUserRolesBatch,
  fetchUserSessions,
  fetchUserWalletSummariesBatch,
  fetchUserWallets,
  type AdminUserListOptions,
} from "../repositories/admin-user.repository";

// ── Response shapes ───────────────────────────────────────────────────────────

export interface AdminUserSummary {
  id:                string;
  email:             string;
  full_name:         string | null;
  status:            string;
  kyc_level:         string;
  is_email_verified: boolean;
  last_login_at:     string | null;
  created_at:        string;
  wallet: {
    wallet_id: string;
    currency:  string;
    balance:   number;
  } | null;
  roles: string[];
}

export interface AdminUserListResult {
  users: AdminUserSummary[];
  total: number;
}

export interface AdminUserProfile {
  id:                string;
  email:             string;
  phone:             string | null;
  username:          string | null;
  status:            string;
  kyc_level:         string;
  is_email_verified: boolean;
  is_phone_verified: boolean;
  last_login_at:     string | null;
  login_count:       number;
  created_at:        string;
  updated_at:        string;
  profile: {
    first_name:    string | null;
    last_name:     string | null;
    display_name:  string | null;
    avatar_url:    string | null;
    date_of_birth: string | null;
    gender:        string | null;
    city:          string | null;
    state:         string | null;
    country:       string | null;
    bvn_verified:  boolean;
    nin_verified:  boolean;
  };
  wallets: Array<{
    wallet_id:   string;
    wallet_type: string;
    currency:    string;
    status:      string;
    is_default:  boolean;
    label:       string | null;
    balance:     number;
    created_at:  string;
  }>;
  recent_transactions: Array<{
    id:         string;
    reference:  string;
    type:       string;
    status:     string;
    amount:     number;
    currency:   string;
    provider:   string | null;
    created_at: string;
  }>;
  roles: Array<{
    role:        string;
    name:        string;
    assigned_at: string;
    expires_at:  string | null;
  }>;
  sessions: Array<{
    id:         string;
    ip_address: string | null;
    user_agent: string | null;
    is_revoked: boolean;
    expires_at: string;
    created_at: string;
  }>;
  notifications_count: {
    total:  number;
    unread: number;
  };
}

// ── List service ──────────────────────────────────────────────────────────────

export async function listAdminUsers(
  opts: AdminUserListOptions,
): Promise<AdminUserListResult> {
  // Run count and page query concurrently
  const [total, rows] = await Promise.all([
    countAdminUsers(opts),
    fetchAdminUserList(opts),
  ]);

  if (rows.length === 0) {
    return { users: [], total };
  }

  const userIds = rows.map((r) => r.id);

  // Batch-fetch ancillary data for the page of results
  const [roleRows, walletRows] = await Promise.all([
    fetchUserRolesBatch(userIds),
    fetchUserWalletSummariesBatch(userIds),
  ]);

  // Build lookup maps
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const existing = rolesByUser.get(r.user_id) ?? [];
    existing.push(r.role);
    rolesByUser.set(r.user_id, existing);
  }

  const walletByUser = new Map<
    string,
    { wallet_id: string; currency: string; balance: number }
  >();
  for (const w of walletRows) {
    walletByUser.set(w.user_id, {
      wallet_id: w.wallet_id,
      currency:  w.currency,
      balance:   Number(w.balance),
    });
  }

  const users: AdminUserSummary[] = rows.map((row) => ({
    id:                row.id,
    email:             row.email,
    full_name:         row.full_name ?? null,
    status:            row.status,
    kyc_level:         row.kyc_level,
    is_email_verified: row.is_email_verified,
    last_login_at:     row.last_login_at ?? null,
    created_at:        row.created_at,
    wallet:            walletByUser.get(row.id) ?? null,
    roles:             rolesByUser.get(row.id)  ?? [],
  }));

  return { users, total };
}

// ── Detail service ────────────────────────────────────────────────────────────

export async function getAdminUser(id: string): Promise<AdminUserProfile> {
  // Fetch user base + profile first — if not found, throw early
  const userRow = await fetchAdminUserById(id);
  if (!userRow) throw new NotFoundError("User");

  // Fetch all related data concurrently
  const [walletRows, txRows, roleRows, sessionRows, notifCount] =
    await Promise.all([
      fetchUserWallets(id),
      fetchUserRecentTransactions(id, 10),
      fetchUserRoles(id),
      fetchUserSessions(id, 5),
      fetchUserNotificationCount(id),
    ]);

  return {
    // Core user fields
    id:                userRow.id,
    email:             userRow.email,
    phone:             userRow.phone   ?? null,
    username:          userRow.username ?? null,
    status:            userRow.status,
    kyc_level:         userRow.kyc_level,
    is_email_verified: userRow.is_email_verified,
    is_phone_verified: userRow.is_phone_verified,
    last_login_at:     userRow.last_login_at ?? null,
    login_count:       userRow.login_count,
    created_at:        userRow.created_at,
    updated_at:        userRow.updated_at,

    // Profile (always present as an object, even if all nulls)
    profile: {
      first_name:    userRow.first_name    ?? null,
      last_name:     userRow.last_name     ?? null,
      display_name:  userRow.display_name  ?? null,
      avatar_url:    userRow.avatar_url    ?? null,
      date_of_birth: userRow.date_of_birth ?? null,
      gender:        userRow.gender        ?? null,
      city:          userRow.city          ?? null,
      state:         userRow.state         ?? null,
      country:       userRow.country       ?? null,
      bvn_verified:  userRow.bvn_verified  ?? false,
      nin_verified:  userRow.nin_verified  ?? false,
    },

    // Wallets
    wallets: walletRows.map((w) => ({
      wallet_id:   w.wallet_id,
      wallet_type: w.wallet_type,
      currency:    w.currency,
      status:      w.status,
      is_default:  w.is_default,
      label:       w.label ?? null,
      balance:     Number(w.balance),
      created_at:  w.created_at,
    })),

    // Recent transactions
    recent_transactions: txRows.map((t) => ({
      id:         t.id,
      reference:  t.reference,
      type:       t.type,
      status:     t.status,
      amount:     Number(t.amount),
      currency:   t.currency,
      provider:   t.provider ?? null,
      created_at: t.created_at,
    })),

    // Roles
    roles: roleRows.map((r) => ({
      role:        r.role,
      name:        r.name,
      assigned_at: r.assigned_at,
      expires_at:  r.expires_at ?? null,
    })),

    // Sessions
    sessions: sessionRows.map((s) => ({
      id:         s.id,
      ip_address: s.ip_address ?? null,
      user_agent: s.user_agent ?? null,
      is_revoked: s.is_revoked,
      expires_at: s.expires_at,
      created_at: s.created_at,
    })),

    // Notification counts
    notifications_count: notifCount,
  };
}
