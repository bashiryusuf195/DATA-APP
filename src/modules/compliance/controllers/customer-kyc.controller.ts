import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../../shared/errors/AppError";
import {
  getCustomerKycStatus,
  submitNin,
  submitBvn,
} from "../services/customer-kyc.service";

const NinSchema = z.object({
  nin: z.string().regex(/^\d{11}$/, "NIN must be exactly 11 digits"),
});

const BvnSchema = z.object({
  bvn: z.string().regex(/^\d{11}$/, "BVN must be exactly 11 digits"),
});

function getUserId(req: Request): string {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return req.user.id;
}

export async function getKycStatusController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const status = await getCustomerKycStatus(userId);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
}

export async function submitNinController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId    = getUserId(req);
    const { nin }   = NinSchema.parse(req.body);
    const record    = await submitNin(userId, nin);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}

export async function submitBvnController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId    = getUserId(req);
    const { bvn }   = BvnSchema.parse(req.body);
    const record    = await submitBvn(userId, bvn);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
}
