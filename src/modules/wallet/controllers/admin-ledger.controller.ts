// src/modules/wallet/controllers/admin-ledger.controller.ts
// HTTP handlers for:
//   GET /admin/wallet-ledger
//   GET /admin/journal-batches
//   GET /admin/journal-batches/:id

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listAdminLedgerEntries,
  listAdminJournalBatches,
  getAdminJournalBatch,
} from "../services/admin-ledger.service";

// ── Schemas ───────────────────────────────────────────────────────────────────

const LEDGER_ENTRY_TYPES  = ["debit", "credit"]                   as const;
const JOURNAL_STATUSES    = ["pending", "posted", "reversed", "failed"] as const;

const LedgerQuerySchema = z.object({
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  offset:         z.coerce.number().int().min(0).default(0),
  wallet_id:      z.string().uuid("wallet_id must be a UUID").optional(),
  user_id:        z.string().uuid("user_id must be a UUID").optional(),
  entry_type:     z.enum(LEDGER_ENTRY_TYPES).optional(),
  reference_id:   z.string().uuid("reference_id must be a UUID").optional(),
  reference_type: z.string().trim().min(1).max(64).optional(),
  from:           z.string().datetime({ offset: true }).optional(),
  to:             z.string().datetime({ offset: true }).optional(),
});

const BatchListQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(JOURNAL_STATUSES).optional(),
  from:   z.string().datetime({ offset: true }).optional(),
  to:     z.string().datetime({ offset: true }).optional(),
});

const BatchIdSchema = z
  .string()
  .uuid("Invalid batch ID — must be a UUID");

// ── GET /admin/wallet-ledger ──────────────────────────────────────────────────

export async function listLedgerController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query  = LedgerQuerySchema.parse(req.query);
    const result = await listAdminLedgerEntries(query);

    res.status(200).json({
      success: true,
      data:    result.entries,
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

// ── GET /admin/journal-batches ────────────────────────────────────────────────

export async function listJournalBatchesController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query  = BatchListQuerySchema.parse(req.query);
    const result = await listAdminJournalBatches(query);

    res.status(200).json({
      success: true,
      data:    result.batches,
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

// ── GET /admin/journal-batches/:id ────────────────────────────────────────────

export async function getJournalBatchController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id     = BatchIdSchema.parse(req.params.id);
    const detail = await getAdminJournalBatch(id);

    res.status(200).json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
}
