import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../../shared/errors/AppError";
import {
  adminListDisputes,
  createDispute,
  updateDispute,
} from "../services/dispute.service";

const DISPUTE_TYPES       = ["wrong_amount", "not_delivered", "duplicate_charge", "unauthorized", "provider_error", "other"] as const;
const DISPUTE_STATUSES    = ["open", "under_review", "escalated", "resolved", "rejected", "closed"]                          as const;
const DISPUTE_RESOLUTIONS = ["refund_issued", "partial_refund", "no_action", "provider_credited", "rejected"]                as const;

const CreateDisputeSchema = z.object({
  ticket_id:             z.string().uuid().nullable().optional(),
  user_id:               z.string().uuid().nullable().optional(),
  user_email:            z.string().email().max(200).nullable().optional(),
  transaction_reference: z.string().max(200).nullable().optional(),
  dispute_type:          z.enum(DISPUTE_TYPES),
  amount_disputed:       z.number().min(0).nullable().optional(),
  currency:              z.string().min(3).max(10).default("NGN"),
});

const UpdateDisputeSchema = z
  .object({
    status:           z.enum(DISPUTE_STATUSES).optional(),
    resolution:       z.enum(DISPUTE_RESOLUTIONS).nullable().optional(),
    resolution_notes: z.string().max(10000).nullable().optional(),
    ticket_id:        z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });

export async function listDisputesController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { status, dispute_type, user_id, search } = req.query;
    const page  = req.query.page  ? parseInt(String(req.query.page),  10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;

    const result = await adminListDisputes({
      status:       typeof status       === "string" ? status       : undefined,
      dispute_type: typeof dispute_type === "string" ? dispute_type : undefined,
      user_id:      typeof user_id      === "string" ? user_id      : undefined,
      search:       typeof search       === "string" ? search       : undefined,
      page,
      limit,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createDisputeController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data    = CreateDisputeSchema.parse(req.body);
    const dispute = await createDispute(data);
    res.status(201).json({ success: true, data: dispute });
  } catch (err) { next(err); }
}

export async function updateDisputeController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data    = UpdateDisputeSchema.parse(req.body);
    const dispute = await updateDispute(req.params.id, data);
    if (!dispute) throw new AppError(404, "DISPUTE_NOT_FOUND", "Dispute not found");
    res.json({ success: true, data: dispute });
  } catch (err) { next(err); }
}
