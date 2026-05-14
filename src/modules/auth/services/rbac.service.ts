// src/modules/auth/services/rbac.service.ts
// Resolves user roles and permissions from the database.
// Permissions are 'resource:action' strings (e.g. 'wallet:read').

import type { Knex }     from "knex";
import type { RbacContext } from "../types";

/**
 * Load all active roles + permissions for a user in one query.
 * Called at login time — result is embedded in the session context.
 */
export async function resolveUserRbac(db: Knex, userId: string): Promise<RbacContext> {
  const rows = await db("user_roles as ur")
    .join("roles as r",              "r.id",  "ur.role_id")
    .leftJoin("role_permissions as rp", "rp.role_id",    "r.id")
    .leftJoin("permissions as p",       "p.id",          "rp.permission_id")
    .where("ur.user_id",  userId)
    .where("r.is_active", true)
    .where((qb) =>
      qb.whereNull("ur.expires_at").orWhere("ur.expires_at", ">", new Date())
    )
    .select(
      "r.slug     as role_slug",
      "p.resource as resource",
      "p.action   as action"
    );

  const roleSet = new Set<string>();
  const permSet = new Set<string>();

  for (const row of rows) {
    if (row.role_slug) roleSet.add(row.role_slug as string);
    if (row.resource && row.action) {
      permSet.add(`${row.resource as string}:${row.action as string}`);
    }
  }

  // super_admin holds wildcard — checked client-side and DB-side
  if (roleSet.has("super_admin")) permSet.add("*:*");

  return {
    roles:       [...roleSet],
    permissions: [...permSet],
  };
}

/**
 * Assign a role to a user by slug. Idempotent.
 */
export async function assignRole(
  db:          Knex,
  userId:      string,
  roleSlug:    string,
  assignedBy?: string
): Promise<void> {
  const role = await db("roles").where({ slug: roleSlug }).first("id");
  if (!role) throw new Error(`Role '${roleSlug}' not found in database`);

  await db("user_roles")
    .insert({ user_id: userId, role_id: role.id, assigned_by: assignedBy ?? null })
    .onConflict(["user_id", "role_id"])
    .ignore();
}

/** O(1) permission check using the pre-resolved permission set. */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes("*:*")) return true;
  const [reqR, reqA] = required.split(":");
  return userPermissions.some((p) => {
    const [r, a] = p.split(":");
    return (r === reqR || r === "*") && (a === reqA || a === "*");
  });
}

/** O(1) role check — any match in the array is sufficient. */
export function hasRole(userRoles: string[], required: string | string[]): boolean {
  const needed = Array.isArray(required) ? required : [required];
  return needed.some((r) => userRoles.includes(r));
}
