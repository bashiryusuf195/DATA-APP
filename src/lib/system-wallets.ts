import { getDbInstance } from '../db/knex';
import { AppError } from './errors';

// Module-level cache — avoids repeated DB queries per request after the first
// successful lookup. Reset to null on process restart (acceptable).
let _settlementWalletId: string | null = null;

/**
 * Resolves the system settlement wallet ID used as the destination for all
 * purchase debits.
 *
 * Resolution order:
 *   1. SYSTEM_SETTLEMENT_WALLET_ID env var (set in Railway / .env)
 *   2. wallets row with label='SYSTEM_SETTLEMENT', wallet_type='settlement'
 *      (created by migration 20260527000001_seed_system_settlement_wallet)
 *
 * Throws 503 if neither source yields a valid wallet.  Callers should let
 * this propagate — the global error handler converts it to a JSON 503.
 */
export async function getSettlementWalletId(): Promise<string> {
  const envId = process.env.SYSTEM_SETTLEMENT_WALLET_ID;
  if (envId) return envId;

  if (_settlementWalletId) return _settlementWalletId;

  const db = getDbInstance();
  const row = await db('wallets')
    .where({ label: 'SYSTEM_SETTLEMENT', wallet_type: 'settlement', status: 'active' })
    .first('id');

  if (!row?.id) {
    throw new AppError(
      'System settlement wallet is not configured. ' +
      'Run migrations or set SYSTEM_SETTLEMENT_WALLET_ID in Railway environment variables.',
      'SERVICE_UNAVAILABLE',
      503,
    );
  }

  _settlementWalletId = row.id as string;
  return _settlementWalletId;
}
