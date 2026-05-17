// src/modules/audit/controllers/admin-audit.controller.ts
// HTTP handlers for:
//   GET /admin/audit-logs
//   GET /admin/audit-logs/:id

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listAdminAuditLogs,
  getAdminAuditLog,
} from "../services/admin-audit.service";

// ── Schemas ───────────────────────────────────────────────────────────────────

const OUTCOMES = ["success", "failure", "partial"] as const;

const ListQuerySchema = z.object({
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  offset:   z.coerce.number().int().min(0).default(0),
  email:    z.string().trim().min(1).max(254).optional(),
  action:   z.string().trim().min(1).max(64).optional(),
  resource: z.string().trim().min(1).max(64).optional(),
  outcome:  z.enum(OUTCOMES).optional(),
  from:     z.string().datetime({ offset: true }).optional(),
  to:       z.string().datetime({ offset: true }).optional(),
});

const IdSchema = z.string().uuid("Invalid audit log ID — must be a UUID");

// ── GET /admin/audit-logs ─────────────────────────────────────────────────────

export async function listAuditLogsController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query  = ListQuerySchema.parse(req.query);
    const result = await listAdminAuditLogs(query);

    res.status(200).json({
      success: true,
      data:    result.logs,
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

// ── GET /admin/audit-logs/:id ─────────────────────────────────────────────────

export async function getAuditLogController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id     = IdSchema.parse(req.params.id);
    const detail = await getAdminAuditLog(id);

    res.status(200).json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
}
