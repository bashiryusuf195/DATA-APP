import type { Knex } from 'knex';

// ── Migration: seed system settlement wallet ────────────────────────────────
//
// Creates the SYSTEM_SETTLEMENT wallet if it does not already exist.
// This is the ledger account that receives the debit from every purchase
// (airtime, data, electricity, cable TV, exam pin, identity verification).
//
// After this migration runs, the backend can locate the wallet by label
// without requiring SYSTEM_SETTLEMENT_WALLET_ID to be set in the environment.
// Setting the env var still takes priority (see src/lib/system-wallets.ts).
//
// Idempotent: the INSERT is guarded by WHERE NOT EXISTS so re-running
// migrations does not create duplicate rows.
// ────────────────────────────────────────────────────────────────────────────

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    INSERT INTO wallets (
      user_id,
      wallet_type,
      currency,
      status,
      label,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      NULL,
      'settlement',
      'NGN',
      'active',
      'SYSTEM_SETTLEMENT',
      '{"seeded": true, "source": "migration_20260527"}'::jsonb,
      NOW(),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1
        FROM wallets
       WHERE label       = 'SYSTEM_SETTLEMENT'
         AND wallet_type = 'settlement'
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Only remove the row if it was created by this migration (no ledger entries).
  // If the wallet has been used in production it must not be deleted.
  await knex.raw(`
    DELETE FROM wallets
     WHERE label       = 'SYSTEM_SETTLEMENT'
       AND wallet_type = 'settlement'
       AND metadata->>'source' = 'migration_20260527'
       AND NOT EXISTS (
         SELECT 1
           FROM wallet_ledger
          WHERE wallet_id = wallets.id
         LIMIT 1
       )
  `);
}
