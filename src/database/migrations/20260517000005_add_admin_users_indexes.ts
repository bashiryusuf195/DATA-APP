import type { Knex } from "knex";

// Indexes that accelerate the GET /admin/users list endpoint:
//   - composite (status, created_at) for the common "filter by status, sort desc" pattern
//   - trigram on user_profiles first_name + last_name for future name search support
//
// The email trigram index (idx_users_email_trgm) already exists from migration 1.
// The (user_id) index on user_roles already exists from migration 1.

export async function up(knex: Knex): Promise<void> {
  // (status, created_at DESC) — accelerates WHERE status = ? ORDER BY created_at DESC
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_users_status_created_at
    ON users (status, created_at DESC)
    WHERE deleted_at IS NULL
  `);

  // Trigram index on first_name and last_name for future partial name search
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_profiles_first_name_trgm
    ON user_profiles USING GIN (first_name gin_trgm_ops)
    WHERE first_name IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_profiles_last_name_trgm
    ON user_profiles USING GIN (last_name gin_trgm_ops)
    WHERE last_name IS NOT NULL
  `);

  // Index on wallets(user_id, wallet_type, is_default) for the wallet summary subquery
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_wallets_user_type_default
    ON wallets (user_id, wallet_type, is_default)
    WHERE user_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_wallets_user_type_default`);
  await knex.raw(`DROP INDEX IF EXISTS idx_profiles_last_name_trgm`);
  await knex.raw(`DROP INDEX IF EXISTS idx_profiles_first_name_trgm`);
  await knex.raw(`DROP INDEX IF EXISTS idx_users_status_created_at`);
}
