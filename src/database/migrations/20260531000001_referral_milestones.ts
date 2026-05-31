import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── Extend referral_settings with milestone fields ─────────────────────────
  await knex.raw(`
    ALTER TABLE referral_settings
      ADD COLUMN IF NOT EXISTS reward_mode             TEXT    NOT NULL DEFAULT 'per_referral'
        CONSTRAINT referral_settings_mode_chk
          CHECK (reward_mode IN ('per_referral', 'milestone')),
      ADD COLUMN IF NOT EXISTS required_referral_count INTEGER NULL
        CONSTRAINT referral_settings_count_pos_chk
          CHECK (required_referral_count IS NULL OR required_referral_count > 0)
  `);

  // ── Multiple milestone tiers ───────────────────────────────────────────────
  // Allows future expansion: 5 → ₦500, 10 → ₦1,000, 20 → ₦2,000, etc.
  // When this table has no active rows, the service falls back to
  // required_referral_count + reward_value from referral_settings.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS referral_milestone_tiers (
      id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      count          INTEGER       NOT NULL UNIQUE
                                   CONSTRAINT rmt_count_pos CHECK (count > 0),
      reward_amount  NUMERIC(12,2) NOT NULL
                                   CONSTRAINT rmt_amount_pos CHECK (reward_amount > 0),
      is_active      BOOLEAN       NOT NULL DEFAULT true,
      created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  // ── Milestone payout ledger ────────────────────────────────────────────────
  // One row per (referrer, milestone_count). The UNIQUE constraint is the
  // idempotency key — concurrent inserts race to a single winner; all losers
  // get a constraint violation and skip payment safely.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS referral_milestone_payouts (
      id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      referrer_id     UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      milestone_count INTEGER       NOT NULL,
      reward_amount   NUMERIC(12,2) NOT NULL,
      status          TEXT          NOT NULL DEFAULT 'processing'
                                    CONSTRAINT rmp_status_chk
                                      CHECK (status IN ('processing', 'completed', 'failed')),
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      UNIQUE (referrer_id, milestone_count)
    )
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_referral_milestone_payouts_referrer
      ON referral_milestone_payouts (referrer_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS referral_milestone_payouts CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS referral_milestone_tiers CASCADE`);
  await knex.raw(`
    ALTER TABLE referral_settings
      DROP COLUMN IF EXISTS reward_mode,
      DROP COLUMN IF EXISTS required_referral_count
  `);
}
