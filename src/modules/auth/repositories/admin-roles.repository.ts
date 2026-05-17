import type { Knex } from "knex";

export interface RoleRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permission_count: string;
  user_count: string;
}

export interface PermissionRow {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: string;
}

export interface UserRoleRow {
  role_id: string;
  role_name: string;
  role_slug: string;
  assigned_at: string;
  assigned_by: string | null;
  assigned_by_email: string | null;
  expires_at: string | null;
}

export async function fetchAllRoles(db: Knex): Promise<RoleRow[]> {
  return db("roles as r")
    .leftJoin("role_permissions as rp", "rp.role_id", "r.id")
    .leftJoin("user_roles as ur", "ur.role_id", "r.id")
    .groupBy("r.id")
    .orderByRaw("r.is_system DESC, r.name ASC")
    .select(
      "r.id",
      "r.name",
      "r.slug",
      "r.description",
      "r.is_system",
      "r.is_active",
      "r.created_at",
      "r.updated_at",
      db.raw("COUNT(DISTINCT rp.permission_id)::text AS permission_count"),
      db.raw("COUNT(DISTINCT ur.user_id)::text AS user_count"),
    );
}

export async function fetchRoleWithPermissions(
  db: Knex,
  id: string,
): Promise<(RoleRow & { permissions: PermissionRow[] }) | undefined> {
  const role = await db("roles").where({ id }).first<RoleRow>();
  if (!role) return undefined;

  const permissions = await db("permissions as p")
    .join("role_permissions as rp", "rp.permission_id", "p.id")
    .where("rp.role_id", id)
    .orderBy("p.resource")
    .orderBy("p.action")
    .select<PermissionRow[]>("p.id", "p.resource", "p.action", "p.description", "p.created_at");

  return { ...role, permission_count: "0", user_count: "0", permissions };
}

export async function fetchAllPermissions(db: Knex): Promise<PermissionRow[]> {
  return db("permissions")
    .orderBy("resource")
    .orderBy("action")
    .select<PermissionRow[]>("*");
}

export async function fetchUserRoles(db: Knex, userId: string): Promise<UserRoleRow[]> {
  return db("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .leftJoin("users as u", "u.id", "ur.assigned_by")
    .where("ur.user_id", userId)
    .orderBy("ur.assigned_at", "desc")
    .select<UserRoleRow[]>(
      db.raw("r.id AS role_id"),
      db.raw("r.name AS role_name"),
      db.raw("r.slug AS role_slug"),
      "ur.assigned_at",
      "ur.assigned_by",
      db.raw("u.email AS assigned_by_email"),
      "ur.expires_at",
    );
}

export async function insertUserRole(
  db: Knex,
  userId: string,
  roleId: string,
  assignedBy: string,
): Promise<void> {
  await db("user_roles")
    .insert({ user_id: userId, role_id: roleId, assigned_by: assignedBy })
    .onConflict(["user_id", "role_id"])
    .ignore();
}

export async function deleteUserRole(
  db: Knex,
  userId: string,
  roleId: string,
): Promise<number> {
  return db("user_roles")
    .where({ user_id: userId, role_id: roleId })
    .delete();
}

export async function countActiveSuperAdmins(db: Knex): Promise<number> {
  const row = await db("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .where("r.slug", "super_admin")
    .where(function () {
      this.whereNull("ur.expires_at").orWhere("ur.expires_at", ">", new Date());
    })
    .count<{ cnt: string }>("ur.user_id as cnt")
    .first();
  return Number(row?.cnt ?? 0);
}

export async function isSuperAdminRole(db: Knex, roleId: string): Promise<boolean> {
  const row = await db("roles").where({ id: roleId, slug: "super_admin" }).first("id");
  return !!row;
}
