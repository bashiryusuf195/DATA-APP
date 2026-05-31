import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";
import {
  getReferralSettings,
  updateReferralSettings,
} from "../services/referral-settings.service";

const db = getDbInstance();

// ── GET /admin/referrals/settings ─────────────────────────────────────────────

export async function getSettingsController(
  _req: Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const settings = await getReferralSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/referrals/settings ──────────────────────────────────────────

const UpdateSettingsSchema = z.object({
  is_enabled:              z.boolean().optional(),
  reward_trigger:          z.enum(["signup", "first_funding", "first_purchase"]).optional(),
  reward_type:             z.enum(["fixed", "percentage"]).optional(),
  reward_value:            z.number().min(0).optional(),
  min_amount:              z.number().min(0).nullable().optional(),
  max_reward_cap:          z.number().min(0).nullable().optional(),
  reward_recipient:        z.enum(["referrer", "both"]).optional(),
  referred_reward_value:   z.number().min(0).nullable().optional(),
  reward_mode:             z.enum(["per_referral", "milestone"]).optional(),
  required_referral_count: z.number().int().min(1).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: "At least one field must be provided",
});

export async function updateSettingsController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const input    = UpdateSettingsSchema.parse(req.body);
    const updated  = await updateReferralSettings(input);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/referrals/summary ──────────────────────────────────────────────

export async function getSummaryController(
  _req: Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const [totals] = await db("referral_rewards")
      .select(
        db.raw("COUNT(DISTINCT referred_id)::int  AS total_referrals"),
        db.raw("COUNT(DISTINCT referrer_id)::int  AS active_referrers"),
        db.raw(
          "COALESCE(SUM(referrer_amount + referred_amount) FILTER (WHERE status = 'completed'), 0)::float AS total_rewards_paid"
        ),
        db.raw(
          "COALESCE(SUM(referrer_amount + referred_amount) FILTER (WHERE status = 'processing'), 0)::float AS pending_rewards"
        )
      )
      .first();

    res.status(200).json({ success: true, data: totals });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/referrals/rewards ──────────────────────────────────────────────

export async function listRewardsController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const query = db("referral_rewards as r")
      .join("users as referrer", "referrer.id", "r.referrer_id")
      .join("users as referred", "referred.id", "r.referred_id")
      .select(
        "r.id",
        "r.referrer_id",
        "r.referred_id",
        "r.trigger_type",
        "r.reward_type",
        db.raw("r.referrer_amount::float"),
        db.raw("r.referred_amount::float"),
        "r.status",
        "r.metadata",
        "r.created_at",
        "r.updated_at",
        "referrer.email as referrer_email",
        "referred.email  as referred_email"
      )
      .orderBy("r.created_at", "desc");

    if (status) query.where("r.status", status);

    const [{ count }] = await db("referral_rewards")
      .modify((q) => { if (status) q.where("status", status); })
      .count("id as count");

    const rows = await query.limit(limit).offset(offset);

    res.status(200).json({
      success: true,
      data:    rows,
      total:   Number(count),
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}
