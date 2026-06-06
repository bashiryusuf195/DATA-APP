import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS user_push_tokens (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token         TEXT        NOT NULL,
      platform      TEXT        NOT NULL DEFAULT 'web'
                    CHECK (platform IN ('web', 'android', 'ios')),
      device_name   TEXT,
      browser       TEXT,
      is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_push_tokens_token_unique UNIQUE (token)
    )
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id
      ON user_push_tokens (user_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_user_push_tokens_active
      ON user_push_tokens (user_id, is_active)
      WHERE is_active = TRUE
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS user_push_tokens`);
}
