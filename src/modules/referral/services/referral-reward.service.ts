import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";
import { WalletService } from "../../../services/wallet/WalletService";
import { getReferralSettings } from "./referral-settings.service";

const db            = getDbInstance();
const walletService = new WalletService(db);

export type ReferralTrigger = "signup" | "first_funding" | "first_purchase";

/**
 * processReferralReward — fire-and-forget.
 * Must always be called with .catch() so failures never break the caller.
 *
 * Idempotency: UNIQUE(referred_id, trigger_type) on referral_rewards means
 * a duplicate trigger for the same user silently returns after the INSERT fails.
 */
export async function processReferralReward(
  trigger:           ReferralTrigger,
  referredUserId:    string,
  transactionAmount?: number
): Promise<void> {
  const settings = await getReferralSettings();
  if (!settings?.is_enabled) return;
  if (settings.reward_trigger !== trigger) return;

  // Min-amount gate for funding / purchase triggers
  if (
    settings.min_amount !== null &&
    transactionAmount !== undefined &&
    transactionAmount < Number(settings.min_amount)
  ) return;

  // Resolve the user who was referred and their referrer
  const referredUser = await db("users")
    .where({ id: referredUserId })
    .select("id", "referred_by_id")
    .first();
  if (!referredUser?.referred_by_id) return;

  const referrerId = referredUser.referred_by_id as string;

  // ── Calculate amounts ──────────────────────────────────────────────────────
  let referrerAmount: number;
  if (settings.reward_type === "fixed") {
    referrerAmount = Number(settings.reward_value);
  } else {
    // percentage
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
          settings.max_reward_cap !== null ? Number(settings.max_reward_cap) : Infinity
        )
      : 0;

  if (referrerAmount === 0 && referredAmount === 0) return;

  // ── Insert reward row — unique constraint provides idempotency ─────────────
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

  // ── Credit referrer ────────────────────────────────────────────────────────
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

  // ── Credit referred user (when recipient = 'both') ─────────────────────────
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
    // Missing referred wallet is not fatal — referrer still gets their reward
  }

  await db("referral_rewards").where({ id: rewardId }).update({
    status:     completed ? "completed" : "processing",
    updated_at: new Date(),
  });
}
