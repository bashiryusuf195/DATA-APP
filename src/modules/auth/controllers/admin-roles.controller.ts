import type { Request, Response } from "express";
import { z } from "zod";
import { NotFoundError } from "../../../lib/errors";
import {
  listRoles,
  listPermissions,
  getUserRoles,
  assignRoleToUser,
  revokeRoleFromUser,
} from "../services/admin-roles.service";

const UUIDSchema = z.string().uuid("Must be a valid UUID");

const AssignRoleBodySchema = z.object({
  role_id: z.string().uuid("role_id must be a valid UUID"),
});

export async function listRolesController(req: Request, res: Response): Promise<void> {
  const roles = await listRoles();
  res.json({ success: true, data: roles });
}

export async function listPermissionsController(req: Request, res: Response): Promise<void> {
  const groups = await listPermissions();
  res.json({ success: true, data: groups });
}

export async function getUserRolesController(req: Request, res: Response): Promise<void> {
  const parsed = UUIDSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid user ID" });
    return;
  }

  try {
    const roles = await getUserRoles(parsed.data);
    res.json({ success: true, data: roles });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ success: false, error: (err as Error).message });
      return;
    }
    throw err;
  }
}

export async function assignRoleController(req: Request, res: Response): Promise<void> {
  const idParsed = UUIDSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ success: false, error: "Invalid user ID" });
    return;
  }

  const bodyParsed = AssignRoleBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ success: false, error: bodyParsed.error.flatten() });
    return;
  }

  try {
    await assignRoleToUser(idParsed.data, bodyParsed.data.role_id, req.user!.id);
    res.status(201).json({ success: true, message: "Role assigned successfully" });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ success: false, error: (err as Error).message });
      return;
    }
    if (err instanceof Error && err.message.includes("inactive")) {
      res.status(400).json({ success: false, error: (err as Error).message });
      return;
    }
    throw err;
  }
}

export async function revokeRoleController(req: Request, res: Response): Promise<void> {
  const idParsed = UUIDSchema.safeParse(req.params.id);
  const roleIdParsed = UUIDSchema.safeParse(req.params.roleId);

  if (!idParsed.success) {
    res.status(400).json({ success: false, error: "Invalid user ID" });
    return;
  }
  if (!roleIdParsed.success) {
    res.status(400).json({ success: false, error: "Invalid role ID" });
    return;
  }

  try {
    await revokeRoleFromUser(idParsed.data, roleIdParsed.data);
    res.json({ success: true, message: "Role removed successfully" });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ success: false, error: (err as Error).message });
      return;
    }
    if (err instanceof Error && err.message.includes("last super_admin")) {
      res.status(409).json({ success: false, error: (err as Error).message });
      return;
    }
    throw err;
  }
}
