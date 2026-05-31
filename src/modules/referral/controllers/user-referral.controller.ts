import type { Request, Response, NextFunction } from "express";
import { getDbInstance } from "../../../db/knex";
import { getReferralSettings } from "../services/referral-settings.service";

const db = getDbInstance();

const APP_URL = process.env.APP_URL ?? "https://app.vtu.ng";

// ── GET /referrals/me ─────────────────────────────────────────────────────────

export async function getMyReferralsController(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    const user = await db("users")
      .where({ id: userId })
      .select("referral_code")
      .first();

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const referralCode: string | null = user.referral_code ?? null;
    const referralLink = referralCode ? `${APP_URL}/signup?ref=${referralCode}` : null;

    // All referred users (anyone who signed up using this user's code)
    const referredUsers: { id: string }[] = await db("users")
      .where({ referred_by_id: userId })
      .select("id");

    const totalReferrals    = referredUsers.length;
    const referredIds       = referredUsers.map((u) => u.id);

    // Reward rows for this referrer — used for both per-referral history and
    // successful-referral count (any row = a qualifying event was recorded)
    const rewardRows = referredIds.length > 0
      ? await db("referral_rewards as r")
          .join("users as referred", "referred.id", "r.referred_id")
          .where("r.referrer_id", userId)
          .select(
            "r.id",
            "r.referred_id",
            "r.trigger_type",
            "r.status",
            db.raw("r.referrer_amount::float AS amount"),
            "referred.email AS referred_user_email",
            "r.created_at",
          )
          .orderBy("r.created_at", "desc")
      : [];

    // "Successful" = at least one qualifying reward row exists for the referred user
    const successfulReferrals = new Set(rewardRows.map((r: { referred_id: string }) => r.referred_id)).size;

    const totalRewards = (rewardRows as Array<{ status: string; amount: number }>)
      .filter((r) => r.status === "completed")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const pendingRewards = (rewardRows as Array<{ status: string; amount: number }>)
      .filter((r) => r.status === "processing")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    // ── Milestone progress ────────────────────────────────────────────────────
    const settings = await getReferralSettings();
    const rewardMode = settings?.reward_mode ?? "per_referral";

    let qualifiedReferrals = 0;
    let nextMilestone: number | null = null;

    if (rewardMode === "milestone" && settings) {
      // Count qualifying events for the active trigger type
      const [{ total }] = await db("referral_rewards")
        .where({ referrer_id: userId, trigger_type: settings.reward_trigger })
        .count("id as total");
      qualifiedReferrals = Number(total);

      // Resolve tiers (same logic as the reward service)
      const dbTiers: Array<{ count: number }> = await db("referral_milestone_tiers")
        .where({ is_active: true })
        .orderBy("count", "asc")
        .select("count");

      const tierCounts: number[] =
        dbTiers.length > 0
          ? dbTiers.map((t) => Number(t.count))
          : settings.required_referral_count !== null
          ? [Number(settings.required_referral_count)]
          : [];

      // Find the lowest unpaid milestone above the current count
      if (tierCounts.length > 0) {
        const paidCounts: number[] = (
          await db("referral_milestone_payouts")
            .where({ referrer_id: userId })
            .pluck("milestone_count")
        ).map(Number);
        const paidSet = new Set(paidCounts);

        nextMilestone = tierCounts.find(
          (c) => !paidSet.has(c)
        ) ?? null;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        referral_code:        referralCode,
        referral_link:        referralLink,
        total_referrals:      totalReferrals,
        successful_referrals: successfulReferrals,
        total_rewards:        totalRewards,
        pending_rewards:      pendingRewards,
        currency:             "NGN",
        rewards:              rewardRows,
        // Milestone fields (null / 0 in per_referral mode)
        reward_mode:          rewardMode,
        qualified_referrals:  qualifiedReferrals,
        next_milestone:       nextMilestone,
      },
    });
  } catch (err) {
    next(err);
  }
}
