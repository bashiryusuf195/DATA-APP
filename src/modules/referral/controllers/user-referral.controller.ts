import type { Request, Response, NextFunction } from "express";
import { getDbInstance } from "../../../db/knex";

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
    const referralLink = referralCode
      ? `${APP_URL}/signup?ref=${referralCode}`
      : null;

    // Total referred users
    const referred = await db("users")
      .where({ referred_by_id: userId })
      .select("id", "email", "created_at");

    // Rewards earned by this user as referrer
    const [rewardTotals] = await db("referral_rewards")
      .where({ referrer_id: userId, status: "completed" })
      .sum({ rewards_earned: db.raw("referrer_amount::float") })
      .select(db.raw("COALESCE(SUM(referrer_amount::float), 0) AS rewards_earned"));

    const rewardsEarned = Number(rewardTotals?.rewards_earned ?? 0);

    // Build referred list with reward status for each
    const referredIds = referred.map((u: { id: string }) => u.id);
    let rewardMap: Record<string, string> = {};

    if (referredIds.length > 0) {
      const rewards = await db("referral_rewards")
        .whereIn("referred_id", referredIds)
        .where("referrer_id", userId)
        .select("referred_id", "status");

      for (const r of rewards) {
        rewardMap[r.referred_id as string] = r.status as string;
      }
    }

    const referredUsers = referred.map((u: { id: string; email: string; created_at: string }) => ({
      id:            u.id,
      email:         u.email,
      created_at:    u.created_at,
      reward_status: rewardMap[u.id] ?? null,
    }));

    res.status(200).json({
      success: true,
      data: {
        referral_code:   referralCode,
        referral_link:   referralLink,
        total_referrals: referred.length,
        rewards_earned:  rewardsEarned,
        referred_users:  referredUsers,
      },
    });
  } catch (err) {
    next(err);
  }
}
