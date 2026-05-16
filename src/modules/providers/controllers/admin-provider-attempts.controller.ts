import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { listProviderAttempts } from "../services/provider-attempts.service";

const QuerySchema = z.object({
  limit:                 z.coerce.number().int().min(1).max(100).default(20),
  offset:                z.coerce.number().int().min(0).default(0),
  transaction_reference: z.string().min(1).optional(),
  provider_code:         z.string().min(1).optional(),
  success:               z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

// ── GET /admin/provider-attempts ──────────────────────────────────────────────

export async function listProviderAttemptsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = QuerySchema.parse(req.query);
    const rows  = await listProviderAttempts({
      limit:                 query.limit,
      offset:                query.offset,
      transaction_reference: query.transaction_reference,
      provider_code:         query.provider_code,
      success:               query.success,
    });

    res.status(200).json({
      success: true,
      data:    rows,
      meta:    { limit: query.limit, offset: query.offset },
    });
  } catch (err) {
    next(err);
  }
}
