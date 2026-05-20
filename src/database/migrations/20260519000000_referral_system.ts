import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── referral_settings (single-row config) ───────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS referral_settings (
      id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      is_enabled            BOOLEAN       NOT NULL DEFAULT false,
      reward_trigger        TEXT          NOT NULL DEFAULT 'signup',
      reward_type           TEXT          NOT NULL DEFAULT 'fixed',
      reward_value          NUMERIC(12,2) NOT NULL DEFAULT 0,
      min_amount            NUMERIC(12,2) NULL,
      max_reward_cap        NUMERIC(12,2) NULL,
      reward_recipient      TEXT          NOT NULL DEFAULT 'referrer',
      referred_reward_value NUMERIC(12,2) NULL,
      created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT referral_settings_trigger_chk  CHECK (reward_trigger  IN ('signup','first_funding','first_purchase')),
      CONSTRAINT referral_settings_type_chk     CHECK (reward_type     IN ('fixed','percentage')),
      CONSTRAINT referral_settings_recip_chk    CHECK (reward_recipient IN ('referrer','both'))
    )
  `);

  // Seed default (disabled) settings row
  await knex.raw(`
    INSERT INTO referral_settings (is_enabled, reward_trigger, reward_type, reward_value)
    VALUES (false, 'signup', 'fixed', 0)
    ON CONFLICT DO NOTHING
  `);

  // ── referral_rewards (issued reward ledger + idempotency key) ────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS referral_rewards (
      id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
      referrer_id     UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      referred_id     UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      trigger_type    TEXT          NOT NULL,
      reward_type     TEXT          NOT NULL,
      referrer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      referred_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status          TEXT          NOT NULL DEFAULT 'processing',
      metadata        JSONB         NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_referral_reward_trigger UNIQUE (referred_id, trigger_type)
    )
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards (referrer_id);
    CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred ON referral_rewards (referred_id);
    CREATE INDEX IF NOT EXISTS idx_referral_rewards_status   ON referral_rewards (status);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS referral_rewards CASCADE`);
  await knex.raw(`DROP TABLE IF EXISTS referral_settings CASCADE`);
}
