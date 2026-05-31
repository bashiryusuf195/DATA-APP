import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export interface ReferralSettings {
  id: string;
  is_enabled: boolean;
  reward_trigger: "signup" | "first_funding" | "first_purchase";
  reward_type: "fixed" | "percentage";
  reward_value: number;
  min_amount: number | null;
  max_reward_cap: number | null;
  reward_recipient: "referrer" | "both";
  referred_reward_value: number | null;
  reward_mode: "per_referral" | "milestone";
  required_referral_count: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReferralMilestoneTier {
  id: string;
  count: number;
  reward_amount: number;
  is_active: boolean;
  created_at: Date;
}

export interface ReferralMilestonePayout {
  id: string;
  referrer_id: string;
  milestone_count: number;
  reward_amount: number;
  status: "processing" | "completed" | "failed";
  created_at: Date;
}

export type UpdateReferralSettingsInput = Partial<
  Omit<ReferralSettings, "id" | "created_at" | "updated_at">
>;

export async function getReferralSettings(): Promise<ReferralSettings | null> {
  const row = await db("referral_settings").first();
  return row ?? null;
}

export async function updateReferralSettings(
  input: UpdateReferralSettingsInput
): Promise<ReferralSettings> {
  const [updated] = await db("referral_settings")
    .update({ ...input, updated_at: new Date() })
    .returning("*");
  return updated as ReferralSettings;
}
