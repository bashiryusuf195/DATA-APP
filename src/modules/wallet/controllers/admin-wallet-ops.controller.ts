// src/modules/wallet/controllers/admin-wallet-ops.controller.ts
// HTTP handlers for:
//   POST /admin/wallet/credit
//   POST /admin/wallet/debit

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { manualWalletAdjust } from "../services/admin-wallet-ops.service";

const AdjustBodySchema = z.object({
  identifier: z
    .string({ required_error: "identifier is required" })
    .trim()
    .min(1, "identifier must not be empty"),

  amount: z
    .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
    .positive("amount must be greater than 0"),

  reason: z
    .string({ required_error: "reason is required" })
    .trim()
    .min(5, "reason must be at least 5 characters")
    .max(500, "reason must not exceed 500 characters"),
});

function resolveIp(req: Request): string | null {
  return (
    ((req.headers["x-forwarded-for"] as string) ?? "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

// ── POST /admin/wallet/credit ─────────────────────────────────────────────────

export async function adminWalletCreditController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body   = AdjustBodySchema.parse(req.body);
    const result = await manualWalletAdjust({
      ...body,
      operation:  "credit",
      admin_id:   req.user!.id,
      ip_address: resolveIp(req),
      user_agent: req.headers["user-agent"] ?? null,
      request_id: req.requestId ?? null,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/wallet/debit ──────────────────────────────────────────────────

export async function adminWalletDebitController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body   = AdjustBodySchema.parse(req.body);
    const result = await manualWalletAdjust({
      ...body,
      operation:  "debit",
      admin_id:   req.user!.id,
      ip_address: resolveIp(req),
      user_agent: req.headers["user-agent"] ?? null,
      request_id: req.requestId ?? null,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
