// src/modules/auth/controllers/admin-users.controller.ts
// HTTP handlers for:
//   GET /admin/users
//   GET /admin/users/:id

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getAdminUser, listAdminUsers } from "../services/admin-user.service";

// ── Schemas ───────────────────────────────────────────────────────────────────

const USER_STATUSES = [
  "pending_verification",
  "active",
  "suspended",
  "deactivated",
  "banned",
] as const;

const ListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),

  email: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .optional(),

  status: z
    .enum(USER_STATUSES)
    .optional(),

  role: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "role must be a valid slug")
    .optional(),
});

const UuidSchema = z
  .string()
  .uuid("Invalid user ID — must be a UUID");

// ── GET /admin/users ──────────────────────────────────────────────────────────

export async function listUsersController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = ListQuerySchema.parse(req.query);
    const result = await listAdminUsers(query);

    res.status(200).json({
      success: true,
      data:    result.users,
      meta: {
        limit:  query.limit,
        offset: query.offset,
        total:  result.total,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/users/:id ──────────────────────────────────────────────────────

export async function getUserController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = UuidSchema.parse(req.params.id);
    const user = await getAdminUser(id);

    res.status(200).json({
      success: true,
      data:    user,
    });
  } catch (err) {
    next(err);
  }
}
