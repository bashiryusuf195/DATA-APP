import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import { getReferralSettings } from "./referral-settings.service";
import type { ReferralSettings } from "./referral-settings.service";

const db            = getDbInstance();
const walletService = new WalletService(db);

export type ReferralTrigger = "signup" | "first_funding" | "first_purchase";

/**
 * processReferralReward — fire-and-forget.
 * Must always be called with .catch() so failures never break the caller.
 *
 * Supports two reward modes controlled by referral_settings.reward_mode:
 *
 *   'per_referral' (default): credit the referrer immediately on each
 *     qualifying trigger. Idempotency via UNIQUE(referred_id, trigger_type)
 *     on referral_rewards.
 *
 *   'milestone': accumulate qualifying events; pay a lump sum only when
 *     the referrer's total crosses a threshold. Idempotency via
 *     UNIQUE(referrer_id, milestone_count) on referral_milestone_payouts.
 *     Thresholds come from referral_milestone_tiers (if rows exist) or fall
 *     back to required_referral_count + reward_value in referral_settings.
 */
export async function processReferralReward(
  trigger:            ReferralTrigger,
  referredUserId:     string,
  transactionAmount?: number
): Promise<void> {
  const settings = await getReferralSettings();
  if (!settings?.is_enabled) return;
  if (settings.reward_trigger !== trigger) return;

  // Min-amount gate (funding / purchase triggers only)
  if (
    settings.min_amount !== null &&
    transactionAmount !== undefined &&
    transactionAmount < Number(settings.min_amount)
  ) return;

  // Resolve the referrer from the referred user's record
  const referredUser = await db("users")
    .where({ id: referredUserId })
    .select("id", "referred_by_id")
    .first();
  if (!referredUser?.referred_by_id) return;

  const referrerId = referredUser.referred_by_id as string;

  const rewardMode: "per_referral" | "milestone" = settings.reward_mode ?? "per_referral";

  if (rewardMode === "milestone") {
    return processInMilestoneMode(referrerId, referredUserId, trigger, transactionAmount, settings);
  }

  return processPerReferral(referrerId, referredUserId, trigger, transactionAmount, settings);
}

// ── Per-referral mode ─────────────────────────────────────────────────────────

async function processPerReferral(
  referrerId:         string,
  referredUserId:     string,
  trigger:            ReferralTrigger,
  transactionAmount:  number | undefined,
  settings:           ReferralSettings,
): Promise<void> {
  // Calculate amounts
  let referrerAmount: number;
  if (settings.reward_type === "fixed") {
    referrerAmount = Number(settings.reward_value);
  } else {
    if (transactionAmount === undefined) return;
    referrerAmount = (transactionAmount * Number(settings.reward_value)) / 100;
  }
  if (settings.max_reward_cap !== null) {
    referrerAmount = Math.min(referrerAmount, Number(settings.max_reward_cap));
  }
  referrerAmount = Math.max(0, referrerAmount);

  const referredAmount =
    settings.reward_recipient === "both" && settings.referred_reward_value !== null
      ? Math.min(
          Number(settings.referred_reward_value),
          settings.max_reward_cap !== null ? Number(settings.max_reward_cap) : Infinity,
        )
      : 0;

  if (referrerAmount === 0 && referredAmount === 0) return;

  // INSERT — UNIQUE(referred_id, trigger_type) is the idempotency guard
  const rewardId = randomUUID();
  try {
    await db("referral_rewards").insert({
      id:              rewardId,
      referrer_id:     referrerId,
      referred_id:     referredUserId,
      trigger_type:    trigger,
      reward_type:     settings.reward_type,
      referrer_amount: referrerAmount,
      referred_amount: referredAmount,
      status:          "processing",
      metadata:        JSON.stringify({ transaction_amount: transactionAmount ?? null }),
      created_at:      new Date(),
      updated_at:      new Date(),
    });
  } catch {
    // Unique constraint violation → already processed for this trigger
    return;
  }

  const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
  if (!settlementWalletId) {
    await db("referral_rewards").where({ id: rewardId }).update({
      status:     "failed",
      metadata:   JSON.stringify({ error: "SYSTEM_SETTLEMENT_WALLET_ID not configured" }),
      updated_at: new Date(),
    });
    return;
  }

  let completed = true;

  // Credit referrer
  if (referrerAmount > 0) {
    const referrerWallet = await db("wallets")
      .where({ user_id: referrerId, wallet_type: "user" })
      .first();
    if (referrerWallet) {
      await walletService.credit({
        wallet_id:        referrerWallet.id,
        contra_wallet_id: settlementWalletId,
        amount:           referrerAmount,
        currency:         "NGN",
        description:      `Referral reward — ${trigger}`,
        idempotency_key:  `referral_${referredUserId}_${trigger}_referrer`,
        reference_type:   "referral_reward",
        reference_id:     rewardId,
        metadata:         { referral_reward_id: rewardId, trigger },
      });
    } else {
      completed = false;
    }
  }

  // Credit referred user when recipient = 'both'
  if (referredAmount > 0) {
    const referredWallet = await db("wallets")
      .where({ user_id: referredUserId, wallet_type: "user" })
      .first();
    if (referredWallet) {
      await walletService.credit({
        wallet_id:        referredWallet.id,
        contra_wallet_id: settlementWalletId,
        amount:           referredAmount,
        currency:         "NGN",
        description:      `Referral signup bonus`,
        idempotency_key:  `referral_${referredUserId}_${trigger}_referred`,
        reference_type:   "referral_reward",
        reference_id:     rewardId,
        metadata:         { referral_reward_id: rewardId, trigger },
      });
    }
    // Missing referred wallet is non-fatal
  }

  await db("referral_rewards").where({ id: rewardId }).update({
    status:     completed ? "completed" : "processing",
    updated_at: new Date(),
  });
}

// ── Milestone mode ────────────────────────────────────────────────────────────

async function processInMilestoneMode(
  referrerId:        string,
  referredUserId:    string,
  trigger:           ReferralTrigger,
  transactionAmount: number | undefined,
  settings:          ReferralSettings,
): Promise<void> {
  // Record the qualifying event. referrer_amount=0 because we are not paying
  // per referral — the lump sum is tracked in referral_milestone_payouts.
  // UNIQUE(referred_id, trigger_type) prevents double-counting if the same
  // referred user somehow triggers this path twice.
  try {
    await db("referral_rewards").insert({
      id:              randomUUID(),
      referrer_id:     referrerId,
      referred_id:     referredUserId,
      trigger_type:    trigger,
      reward_type:     settings.reward_type,
      referrer_amount: 0,
      referred_amount: 0,
      status:          "completed",
      metadata:        JSON.stringify({
        transaction_amount: transactionAmount ?? null,
        mode: "milestone",
      }),
      created_at:      new Date(),
      updated_at:      new Date(),
    });
  } catch {
    // Already counted — idempotent, stop here
    return;
  }

  // Count all qualifying referrals this referrer has accumulated
  const [{ total }] = await db("referral_rewards")
    .where({ referrer_id: referrerId, trigger_type: trigger })
    .count("id as total");
  const qualifiedCount = Number(total);

  // Resolve milestone tiers: prefer the tiers table; fall back to settings fields
  const tiers = await resolveMilestoneTiers(settings);
  if (tiers.length === 0) return;

  const settlementWalletId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
  if (!settlementWalletId) return;

  // Resolve referrer wallet once (shared across all milestone credits)
  const referrerWallet = await db("wallets")
    .where({ user_id: referrerId, wallet_type: "user" })
    .first();

  for (const tier of tiers) {
    // Has the referrer reached this threshold?
    if (qualifiedCount < tier.count) continue;

    // Race-safe payout: INSERT first, credit second.
    // If two concurrent calls both see qualifiedCount >= tier.count,
    // only one INSERT succeeds; the other hits
    // UNIQUE(referrer_id, trigger_type, milestone_count) and skips safely.
    const payoutId = randomUUID();
    try {
      await db("referral_milestone_payouts").insert({
        id:              payoutId,
        referrer_id:     referrerId,
        trigger_type:    trigger,
        milestone_count: tier.count,
        reward_amount:   tier.rewardAmount,
        status:          "processing",
        created_at:      new Date(),
      });
    } catch {
      // Already paid this milestone for this trigger — skip
      continue;
    }

    if (!referrerWallet) {
      await db("referral_milestone_payouts")
        .where({ id: payoutId })
        .update({ status: "failed" });
      continue;
    }

    await walletService.credit({
      wallet_id:        referrerWallet.id,
      contra_wallet_id: settlementWalletId,
      amount:           tier.rewardAmount,
      currency:         "NGN",
      description:      `Referral milestone: ${tier.count} referral${tier.count === 1 ? "" : "s"}`,
      idempotency_key:  `milestone_${referrerId}_${trigger}_${tier.count}`,
      reference_type:   "referral_milestone",
      reference_id:     payoutId,
      metadata:         { milestone_count: tier.count, trigger },
    });

    await db("referral_milestone_payouts")
      .where({ id: payoutId })
      .update({ status: "completed" });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Tier = { count: number; rewardAmount: number };

/**
 * Returns milestone tiers in ascending order of count.
 * Checks referral_milestone_tiers first. If no active rows exist, creates
 * a synthetic single-tier from referral_settings.required_referral_count
 * and reward_value so the simple admin workflow (set one count + one amount)
 * works without needing to populate the tiers table.
 */
async function resolveMilestoneTiers(settings: ReferralSettings): Promise<Tier[]> {
  const dbTiers = await db("referral_milestone_tiers")
    .where({ is_active: true })
    .orderBy("count", "asc")
    .select("count", "reward_amount");

  if (dbTiers.length > 0) {
    return dbTiers.map((t: { count: number; reward_amount: number }) => ({
      count:        Number(t.count),
      rewardAmount: Number(t.reward_amount),
    }));
  }

  // Simple fallback: single tier from referral_settings
  if (settings.required_referral_count !== null) {
    return [{
      count:        Number(settings.required_referral_count),
      rewardAmount: Number(settings.reward_value),
    }];
  }

  return [];
}
