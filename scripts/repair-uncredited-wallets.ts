// scripts/repair-uncredited-wallets.ts
//
// Finds wallet_funding transactions that Paystack confirmed (status=successful,
// verified=true in funding_transactions) but whose wallet was never credited
// (no wallet_journal_batches row with the expected idempotency_key exists).
//
// Safe to run multiple times — walletService.credit() is idempotent and the
// SELECT checks before crediting, so already-fixed rows are skipped.
//
// Run:
//   npx tsx scripts/repair-uncredited-wallets.ts
//
// Dry-run (inspect only, no credits applied):
//   DRY_RUN=true npx tsx scripts/repair-uncredited-wallets.ts

import '../src/config/index';           // load .env first
import { getDbInstance } from '../src/db/knex';
import { WalletService } from '../src/services/wallet/WalletService';
import {
  getTransactionByReference,
  createTransaction,
} from '../src/modules/transactions/services/transaction.service';

const db            = getDbInstance();
const walletService = new WalletService(db);
const DRY_RUN       = process.env['DRY_RUN'] === 'true';

async function main() {
  const settlementWalletId = process.env['SYSTEM_SETTLEMENT_WALLET_ID'];
  if (!settlementWalletId) {
    throw new Error('SYSTEM_SETTLEMENT_WALLET_ID is not set in .env');
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log('  Wallet credit repair script');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`${'─'.repeat(60)}\n`);

  // Find funding_transactions that are successful/verified but have no
  // matching wallet_journal_batches row (meaning credit never ran).
  const uncredited = await db('funding_transactions as ft')
    .select(
      'ft.id',
      'ft.reference',
      'ft.user_id',
      'ft.amount',
      'ft.credited_amount',
      'ft.currency',
      'ft.status',
      'ft.verified',
      'ft.charge_amount',
      'ft.created_at',
    )
    .where('ft.status', 'successful')
    .where('ft.verified', true)
    .whereNotExists(
      db('wallet_journal_batches as wb')
        .whereRaw("wb.idempotency_key = 'paystack_credit_' || ft.reference")
        .select(db.raw('1'))
    )
    .orderBy('ft.created_at', 'asc');

  if (uncredited.length === 0) {
    console.log('✓  No uncredited wallets found — nothing to repair.\n');
    return;
  }

  console.log(`Found ${uncredited.length} funding transaction(s) needing repair:\n`);

  let repaired = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const row of uncredited) {
    const reference     = row.reference as string;
    const userId        = row.user_id as string;
    const amount        = parseFloat(String(row.amount));
    const creditedAmount = row.credited_amount != null
      ? parseFloat(String(row.credited_amount))
      : amount;
    const currency = (row.currency as string | null) ?? 'NGN';

    process.stdout.write(`  ${reference}  user=${userId}  amount=₦${amount}  credit=₦${creditedAmount}  ...  `);

    if (DRY_RUN) {
      console.log('SKIP (dry-run)');
      skipped++;
      continue;
    }

    try {
      // Find the user's wallet
      const userWallet = await db('wallets')
        .where({ user_id: userId, wallet_type: 'user' })
        .first();

      if (!userWallet) {
        console.log(`SKIP — no wallet for user ${userId}`);
        skipped++;
        continue;
      }

      // Credit the wallet (idempotent — safe to re-run)
      const walletResult = await walletService.credit({
        wallet_id:        userWallet.id as string,
        contra_wallet_id: settlementWalletId,
        amount:           creditedAmount,
        currency:         'NGN',
        description:      `REPAIR: Wallet funding via Paystack (${reference})`,
        idempotency_key:  `paystack_credit_${reference}`,
        reference_type:   'paystack_funding',
        reference_id:     row.id as string,
        metadata:         { reference, gateway: 'paystack', repaired: true, repaired_at: new Date().toISOString() },
      });

      // Create the transactions record if missing (skip if webhook worker already created it)
      const existingTx = await getTransactionByReference(reference).catch(() => null);
      if (!existingTx) {
        await createTransaction({
          user_id:               userId,
          reference,
          type:                  'wallet_funding',
          status:                'successful',
          amount:                creditedAmount,
          currency,
          source_wallet_id:      settlementWalletId,
          destination_wallet_id: userWallet.id as string,
          journal_batch_id:      walletResult.journal_batch_id,
          provider:              'paystack',
          description:           'REPAIR: Wallet funding via Paystack',
          metadata:              { repaired: true, repaired_at: new Date().toISOString() },
          processed_at:          new Date(),
        });
      }

      const newBalance = await walletService.getBalance(userWallet.id as string).catch(() => null);
      console.log(`OK  balance=₦${newBalance ?? '?'}  idempotent=${walletResult.idempotent}`);
      repaired++;

    } catch (err) {
      console.log(`FAILED — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Repaired: ${repaired}  |  Skipped: ${skipped}  |  Failed: ${failed}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => { console.error('Fatal:', (err as Error).message); process.exit(1); })
  .finally(() => db.destroy());
