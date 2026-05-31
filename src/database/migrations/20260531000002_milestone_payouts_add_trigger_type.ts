import type { Knex } from "knex";

/**
 * Addendum to 20260531000001_referral_milestones.
 *
 * Problem: referral_milestone_payouts had UNIQUE(referrer_id, milestone_count).
 * Without trigger_type in the key, a referrer who hit milestone_count=5 under
 * trigger='first_funding' would be permanently blocked from ever hitting the
 * same count for trigger='first_purchase' if the admin changes the trigger.
 *
 * Fix: add trigger_type column and widen the unique constraint to
 * UNIQUE(referrer_id, trigger_type, milestone_count).
 */
export async function up(knex: Knex): Promise<void> {
  // Add trigger_type. DEFAULT '' lets this run safely even if rows already exist
  // (pre-deploy there are none, but the default is a safety net).
  await knex.raw(`
    ALTER TABLE referral_milestone_payouts
      ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT ''
  `);

  // Drop the old two-column constraint (Postgres auto-names it after the columns)
  await knex.raw(`
    ALTER TABLE referral_milestone_payouts
      DROP CONSTRAINT IF EXISTS referral_milestone_payouts_referrer_id_milestone_count_key
  `);

  // Add the correct three-column constraint
  await knex.raw(`
    ALTER TABLE referral_milestone_payouts
      ADD CONSTRAINT uq_milestone_payout_trigger
        UNIQUE (referrer_id, trigger_type, milestone_count)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE referral_milestone_payouts
      DROP CONSTRAINT IF EXISTS uq_milestone_payout_trigger
  `);

  await knex.raw(`
    ALTER TABLE referral_milestone_payouts
      ADD CONSTRAINT referral_milestone_payouts_referrer_id_milestone_count_key
        UNIQUE (referrer_id, milestone_count)
  `);

  await knex.raw(`
    ALTER TABLE referral_milestone_payouts
      DROP COLUMN IF EXISTS trigger_type
  `);
}
