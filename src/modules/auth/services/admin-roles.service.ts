import { getDbInstance } from "../../../db/knex";
import { NotFoundError } from "../../../lib/errors";
import {
  fetchAllRoles,
  fetchAllPermissions,
  fetchUserRoles,
  insertUserRole,
  deleteUserRole,
  countActiveSuperAdmins,
  isSuperAdminRole,
  type RoleRow,
  type PermissionRow,
  type UserRoleRow,
} from "../repositories/admin-roles.repository";

export interface RoleEntry {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permission_count: number;
  user_count: number;
}

export interface PermissionGroup {
  resource: string;
  permissions: Array<{
    id: string;
    action: string;
    description: string | null;
  }>;
}

export type UserRoleEntry = UserRoleRow;

function castRole(row: RoleRow): RoleEntry {
  return {
    id:               row.id,
    name:             row.name,
    slug:             row.slug,
    description:      row.description,
    is_system:        row.is_system,
    is_active:        row.is_active,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
    permission_count: Number(row.permission_count),
    user_count:       Number(row.user_count),
  };
}

function groupPermissions(rows: PermissionRow[]): PermissionGroup[] {
  const map = new Map<string, PermissionGroup>();
  for (const row of rows) {
    if (!map.has(row.resource)) {
      map.set(row.resource, { resource: row.resource, permissions: [] });
    }
    map.get(row.resource)!.permissions.push({
      id:          row.id,
      action:      row.action,
      description: row.description,
    });
  }
  return [...map.values()].sort((a, b) => a.resource.localeCompare(b.resource));
}

export async function listRoles(): Promise<RoleEntry[]> {
  const db = getDbInstance();
  const rows = await fetchAllRoles(db);
  return rows.map(castRole);
}

export async function listPermissions(): Promise<PermissionGroup[]> {
  const db = getDbInstance();
  const rows = await fetchAllPermissions(db);
  return groupPermissions(rows);
}

export async function getUserRoles(userId: string): Promise<UserRoleEntry[]> {
  const db = getDbInstance();
  const user = await db("users").where({ id: userId }).first("id");
  if (!user) throw new NotFoundError("User not found");
  return fetchUserRoles(db, userId);
}

export async function assignRoleToUser(
  userId: string,
  roleId: string,
  assignedBy: string,
): Promise<void> {
  const db = getDbInstance();

  const [user, role] = await Promise.all([
    db("users").where({ id: userId }).first("id"),
    db("roles").where({ id: roleId }).first("id", "slug", "is_active"),
  ]);

  if (!user) throw new NotFoundError("User not found");
  if (!role) throw new NotFoundError("Role not found");
  if (!role.is_active) throw new Error("Role is inactive and cannot be assigned");

  await insertUserRole(db, userId, roleId, assignedBy);
}

export async function revokeRoleFromUser(
  userId: string,
  roleId: string,
): Promise<void> {
  const db = getDbInstance();

  const [user, role] = await Promise.all([
    db("users").where({ id: userId }).first("id"),
    db("roles").where({ id: roleId }).first("id", "slug"),
  ]);

  if (!user) throw new NotFoundError("User not found");
  if (!role) throw new NotFoundError("Role not found");

  const isSuperAdmin = await isSuperAdminRole(db, roleId);
  if (isSuperAdmin) {
    const remaining = await countActiveSuperAdmins(db);
    if (remaining <= 1) {
      throw new Error("Cannot remove the last super_admin — at least one must remain");
    }
  }

  const deleted = await deleteUserRole(db, userId, roleId);
  if (deleted === 0) throw new NotFoundError("User does not have this role assigned");
}
