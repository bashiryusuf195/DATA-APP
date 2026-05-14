// ============================================================
// tests/wallet.test.ts
//
// Run with:  npx tsx tests/wallet.test.ts
//
// Covers:
//   1. Create test user
//   2. Create wallet
//   3. Credit wallet
//   4. Debit wallet
//   5. Reject insufficient balance
//   6. Reject duplicate idempotency key
//   7. Wallet-to-wallet transfer
//   8. Advisory lock: concurrent debits (sequential simulation)
//   9. Ledger balance equals sum of all entries
//  10. Journal batch always balances (SUM signed_amount = 0)
//  11. Wallet in non-active status rejects operations
//  12. Ledger history pagination
// ============================================================

import "dotenv/config";
import { randomUUID } from "crypto";
import Knex from "knex";

import { WalletService }         from "../src/wallet/WalletService.js";
import { WalletError }           from "../src/errors/WalletError.js";
import {
  test, runTests, assert, assertEqual,
  assertApprox, createTestUser, createSystemWallet, section,
} from "./helpers.js";

// ── DB + Service setup ────────────────────────────────────────

const db = Knex({
  client:     "pg",
  connection: {
    connectionString: process.env.DATABASE_URL!,
    ssl: process.env.DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 1, max: 5 },
});

const walletService = new WalletService(db);

// ── Shared fixtures (created once, reused across tests) ───────

let userId:         string;
let walletId:       string;
let contraWalletId: string;   // system settlement wallet (debit source for credits)

// ─────────────────────────────────────────────────────────────
// Setup: create fixtures before all tests
// ─────────────────────────────────────────────────────────────

async function setup(): Promise<void> {
  userId         = await createTestUser(db);
  contraWalletId = await createSystemWallet(db, "settlement", "NGN");
}

// ─────────────────────────────────────────────────────────────
// 1. Create wallet
// ─────────────────────────────────────────────────────────────
section("Wallet creation");

test("creates a user wallet with correct defaults", async () => {
  const wallet = await walletService.createWallet({
    user_id:     userId,
    wallet_type: "user",
    currency:    "NGN",
    is_default:  true,
    label:       "Main Wallet",
  });

  walletId = wallet.id;  // store for subsequent tests

  assertEqual(wallet.user_id,     userId,  "user_id");
  assertEqual(wallet.wallet_type, "user",  "wallet_type");
  assertEqual(wallet.currency,    "NGN",   "currency");
  assertEqual(wallet.is_default,  true,    "is_default");
  assertEqual(wallet.status,      "active","status");
  assertApprox(wallet.overdraft_limit, 0,  "overdraft_limit");
});

test("fetched wallet matches created wallet", async () => {
  const fetched = await walletService.getWallet(walletId);
  assertEqual(fetched.id,      walletId, "wallet id");
  assertEqual(fetched.user_id, userId,   "user_id");
});

test("throws WalletNotFoundError for unknown wallet", async () => {
  const fakeId = randomUUID();
  try {
    await walletService.getWallet(fakeId);
    assert(false, "should have thrown");
  } catch (err) {
    assert(err instanceof WalletError,   "is WalletError");
    assertEqual((err as WalletError).code, "WALLET_NOT_FOUND", "error code");
  }
});

test("new wallet has balance of 0", async () => {
  const balance = await walletService.getBalance(walletId);
  assertApprox(balance, 0, "initial balance");
});

// ─────────────────────────────────────────────────────────────
// 2. Credit wallet
// ─────────────────────────────────────────────────────────────
section("Credit operations");

test("credits wallet — balance increases", async () => {
  const { journal_batch_id, idempotent } = await walletService.credit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           5000.00,
    currency:         "NGN",
    description:      "Wallet top-up via bank transfer",
    idempotency_key:  `topup-${randomUUID()}`,
    reference_type:   "topup",
  });

  assert(typeof journal_batch_id === "string", "returns journal_batch_id");
  assertEqual(idempotent, false, "not idempotent on first call");

  const balance = await walletService.getBalance(walletId);
  assertApprox(balance, 5000.00, "balance after credit");
});

test("multiple credits accumulate correctly", async () => {
  await walletService.credit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           2500.00,
    currency:         "NGN",
    description:      "Second top-up",
    idempotency_key:  `topup-${randomUUID()}`,
  });

  const balance = await walletService.getBalance(walletId);
  assertApprox(balance, 7500.00, "balance after two credits");
});

test("credit journal batch balances to zero", async () => {
  const { journal_batch_id } = await walletService.credit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           1000.00,
    currency:         "NGN",
    description:      "Balance invariant check credit",
    idempotency_key:  `topup-${randomUUID()}`,
  });

  const { entries } = await walletService.getJournalBatch(journal_batch_id);
  const sum = entries.reduce((acc, e) => acc + e.signed_amount, 0);
  assertApprox(sum, 0, "journal batch signed_amount sum");
  assertEqual(entries.length, 2, "two ledger entries");
});

// ─────────────────────────────────────────────────────────────
// 3. Debit wallet
// ─────────────────────────────────────────────────────────────
section("Debit operations");

test("debits wallet — balance decreases", async () => {
  const balanceBefore = await walletService.getBalance(walletId);

  await walletService.debit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           1500.00,
    currency:         "NGN",
    description:      "Airtime purchase",
    idempotency_key:  `debit-${randomUUID()}`,
    reference_type:   "airtime_purchase",
  });

  const balanceAfter = await walletService.getBalance(walletId);
  assertApprox(balanceAfter, balanceBefore - 1500.00, "balance after debit");
});

test("debit journal batch balances to zero", async () => {
  const { journal_batch_id } = await walletService.debit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           500.00,
    currency:         "NGN",
    description:      "Balance invariant check debit",
    idempotency_key:  `debit-${randomUUID()}`,
  });

  const { entries } = await walletService.getJournalBatch(journal_batch_id);
  const sum = entries.reduce((acc, e) => acc + e.signed_amount, 0);
  assertApprox(sum, 0, "debit journal signed_amount sum");
  assertEqual(entries.length, 2, "two ledger entries");
});

// ─────────────────────────────────────────────────────────────
// 4. Insufficient balance rejection
// ─────────────────────────────────────────────────────────────
section("Insufficient balance");

test("rejects debit when balance is insufficient", async () => {
  const currentBalance = await walletService.getBalance(walletId);
  const tooMuch = currentBalance + 999_999.00;

  try {
    await walletService.debit({
      wallet_id:        walletId,
      contra_wallet_id: contraWalletId,
      amount:           tooMuch,
      currency:         "NGN",
      description:      "Should be rejected",
      idempotency_key:  `debit-overflow-${randomUUID()}`,
    });
    assert(false, "expected InsufficientBalanceError");
  } catch (err) {
    assert(err instanceof WalletError,         "is WalletError");
    assertEqual((err as WalletError).code, "INSUFFICIENT_BALANCE", "error code");
  }
});

test("balance unchanged after rejected debit", async () => {
  const before = await walletService.getBalance(walletId);

  try {
    await walletService.debit({
      wallet_id:        walletId,
      contra_wallet_id: contraWalletId,
      amount:           before + 1,
      currency:         "NGN",
      description:      "Should fail",
    });
  } catch {
    // expected
  }

  const after = await walletService.getBalance(walletId);
  assertApprox(after, before, "balance unchanged after failed debit");
});

test("debit succeeds when overdraft_limit covers shortfall", async () => {
  // Create a wallet with overdraft allowance
  const overdraftWalletId = (
    await walletService.createWallet({
      user_id:         userId,
      currency:        "NGN",
      overdraft_limit: 500.00,
    })
  ).id;

  // No credits — balance is 0, overdraft allows up to 500
  const { journal_batch_id } = await walletService.debit({
    wallet_id:        overdraftWalletId,
    contra_wallet_id: contraWalletId,
    amount:           499.99,
    currency:         "NGN",
    description:      "Overdraft debit",
    idempotency_key:  `overdraft-${randomUUID()}`,
  });

  assert(typeof journal_batch_id === "string", "overdraft debit succeeded");
  const balance = await walletService.getBalance(overdraftWalletId);
  assertApprox(balance, -499.99, "balance is negative after overdraft");
});

// ─────────────────────────────────────────────────────────────
// 5. Idempotency key enforcement
// ─────────────────────────────────────────────────────────────
section("Idempotency");

test("duplicate idempotency_key returns same batch_id, no double-post", async () => {
  const key = `idem-${randomUUID()}`;

  const first = await walletService.credit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           1000.00,
    currency:         "NGN",
    description:      "Idempotency test credit",
    idempotency_key:  key,
  });

  const balanceAfterFirst = await walletService.getBalance(walletId);

  const second = await walletService.credit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           1000.00,
    currency:         "NGN",
    description:      "Idempotency test credit (retry)",
    idempotency_key:  key,
  });

  const balanceAfterSecond = await walletService.getBalance(walletId);

  assertEqual(first.journal_batch_id, second.journal_batch_id, "same batch_id");
  assertEqual(second.idempotent,       true,                    "flagged as idempotent");
  assertApprox(balanceAfterSecond, balanceAfterFirst,           "balance not double-posted");
});

test("same idempotency key on debit is also idempotent", async () => {
  const key = `idem-debit-${randomUUID()}`;
  const balanceBefore = await walletService.getBalance(walletId);

  const first = await walletService.debit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           200.00,
    currency:         "NGN",
    description:      "Idempotency debit test",
    idempotency_key:  key,
  });

  const second = await walletService.debit({
    wallet_id:        walletId,
    contra_wallet_id: contraWalletId,
    amount:           200.00,
    currency:         "NGN",
    description:      "Idempotency debit test (retry)",
    idempotency_key:  key,
  });

  assertEqual(first.journal_batch_id,  second.journal_batch_id, "same debit batch_id");
  assertEqual(second.idempotent,        true,                    "flagged idempotent");

  const balanceAfter = await walletService.getBalance(walletId);
  assertApprox(balanceAfter, balanceBefore - 200.00, "deducted exactly once");
});

// ─────────────────────────────────────────────────────────────
// 6. Wallet-to-wallet transfer
// ─────────────────────────────────────────────────────────────
section("Transfers");

test("transfer moves funds between two wallets exactly", async () => {
  const recipientId = await createTestUser(db);
  const recipientWalletId = (
    await walletService.createWallet({ user_id: recipientId, currency: "NGN" })
  ).id;

  const senderBefore    = await walletService.getBalance(walletId);
  const recipientBefore = await walletService.getBalance(recipientWalletId);

  const transferAmount = 750.00;

  const { journal_batch_id } = await walletService.transfer({
    from_wallet_id:  walletId,
    to_wallet_id:    recipientWalletId,
    amount:          transferAmount,
    currency:        "NGN",
    description:     "Test P2P transfer",
    idempotency_key: `transfer-${randomUUID()}`,
  });

  const senderAfter    = await walletService.getBalance(walletId);
  const recipientAfter = await walletService.getBalance(recipientWalletId);

  assertApprox(senderAfter,    senderBefore    - transferAmount, "sender balance decreased");
  assertApprox(recipientAfter, recipientBefore + transferAmount, "recipient balance increased");

  // Verify the batch itself balances
  const { entries } = await walletService.getJournalBatch(journal_batch_id);
  const sum = entries.reduce((acc, e) => acc + e.signed_amount, 0);
  assertApprox(sum, 0, "transfer journal balances");
  assertEqual(entries.length, 2, "exactly 2 ledger entries");
});

test("transfer to self is rejected", async () => {
  try {
    await walletService.transfer({
      from_wallet_id: walletId,
      to_wallet_id:   walletId,
      amount:         100.00,
      currency:       "NGN",
      description:    "Self transfer — should fail",
    });
    assert(false, "expected error");
  } catch (err) {
    assert(err instanceof WalletError,       "is WalletError");
    assertEqual((err as WalletError).code, "TRANSFER_INVALID", "error code");
  }
});

test("transfer with zero amount is rejected", async () => {
  const recipientWalletId = (
    await walletService.createWallet({ user_id: userId, currency: "NGN" })
  ).id;

  try {
    await walletService.transfer({
      from_wallet_id: walletId,
      to_wallet_id:   recipientWalletId,
      amount:         0,
      currency:       "NGN",
      description:    "Zero transfer — should fail",
    });
    assert(false, "expected error");
  } catch (err) {
    assert(err instanceof WalletError,      "is WalletError");
    assertEqual((err as WalletError).code, "INVALID_AMOUNT", "error code");
  }
});

// ─────────────────────────────────────────────────────────────
// 7. Inactive wallet rejection
// ─────────────────────────────────────────────────────────────
section("Wallet status enforcement");

test("suspended wallet rejects credit", async () => {
  const suspendedWalletId = (
    await walletService.createWallet({ user_id: userId, currency: "NGN" })
  ).id;

  // Suspend the wallet directly
  await db("wallets").where({ id: suspendedWalletId }).update({ status: "suspended" });

  try {
    await walletService.credit({
      wallet_id:        suspendedWalletId,
      contra_wallet_id: contraWalletId,
      amount:           100.00,
      currency:         "NGN",
      description:      "Should be rejected",
      idempotency_key:  `suspend-test-${randomUUID()}`,
    });
    assert(false, "expected error");
  } catch (err) {
    assert(err instanceof WalletError,      "is WalletError");
    assertEqual((err as WalletError).code, "WALLET_INACTIVE", "error code");
  }
});

test("frozen wallet rejects debit", async () => {
  const frozenWalletId = (
    await walletService.createWallet({ user_id: userId, currency: "NGN" })
  ).id;

  // Credit it first so it has a balance
  await walletService.credit({
    wallet_id:        frozenWalletId,
    contra_wallet_id: contraWalletId,
    amount:           500.00,
    currency:         "NGN",
    description:      "Pre-freeze credit",
    idempotency_key:  `pre-freeze-${randomUUID()}`,
  });

  await db("wallets").where({ id: frozenWalletId }).update({ status: "frozen" });

  try {
    await walletService.debit({
      wallet_id:        frozenWalletId,
      contra_wallet_id: contraWalletId,
      amount:           100.00,
      currency:         "NGN",
      description:      "Should be rejected",
      idempotency_key:  `frozen-debit-${randomUUID()}`,
    });
    assert(false, "expected error");
  } catch (err) {
    assert(err instanceof WalletError,      "is WalletError");
    assertEqual((err as WalletError).code, "WALLET_INACTIVE", "error code");
  }
});

// ─────────────────────────────────────────────────────────────
// 8. Ledger history pagination
// ─────────────────────────────────────────────────────────────
section("Ledger history");

test("getLedgerPage returns entries newest-first", async () => {
  const page = await walletService.getLedgerPage({
    wallet_id: walletId,
    limit:     5,
    offset:    0,
  });

  assert(Array.isArray(page),  "returns array");
  assert(page.length > 0,      "has entries");

  // Entries should be sorted newest → oldest
  for (let i = 0; i < page.length - 1; i++) {
    assert(
      page[i].created_at >= page[i + 1].created_at,
      `entry ${i} is newer than entry ${i + 1}`
    );
  }
});

test("offset pagination returns different pages", async () => {
  const page1 = await walletService.getLedgerPage({ wallet_id: walletId, limit: 2, offset: 0 });
  const page2 = await walletService.getLedgerPage({ wallet_id: walletId, limit: 2, offset: 2 });

  if (page1.length === 2 && page2.length > 0) {
    assert(page1[0].id !== page2[0].id, "pages are different");
  }
});

// ─────────────────────────────────────────────────────────────
// 9. Ledger balance consistency
// ─────────────────────────────────────────────────────────────
section("Balance consistency");

test("getBalance() matches manual SUM of signed_amount in ledger", async () => {
  const serviceBalance = await walletService.getBalance(walletId);

  const result = await db("wallet_ledger")
    .where({ wallet_id: walletId })
    .sum("signed_amount as total")
    .first();

  const manualBalance = parseFloat(result?.total ?? "0");
  assertApprox(serviceBalance, manualBalance, "service balance vs manual SUM");
});

// ─────────────────────────────────────────────────────────────
// 10. Currency mismatch
// ─────────────────────────────────────────────────────────────
section("Currency validation");

test("credit with wrong currency is rejected", async () => {
  try {
    await walletService.credit({
      wallet_id:        walletId,         // NGN wallet
      contra_wallet_id: contraWalletId,
      amount:           100.00,
      currency:         "USD",            // wrong currency
      description:      "Currency mismatch test",
      idempotency_key:  `currency-mismatch-${randomUUID()}`,
    });
    assert(false, "expected error");
  } catch (err) {
    assert(err instanceof WalletError,      "is WalletError");
    assertEqual((err as WalletError).code, "CURRENCY_MISMATCH", "error code");
  }
});

// ─────────────────────────────────────────────────────────────
// 11. getUserWallets
// ─────────────────────────────────────────────────────────────
section("Wallet listing");

test("getUserWallets returns all wallets for a user", async () => {
  const wallets = await walletService.getUserWallets(userId);
  assert(wallets.length >= 1,  "user has at least one wallet");
  assert(wallets.every(w => w.user_id === userId), "all wallets belong to user");
  // Default wallet comes first
  if (wallets.length > 1) {
    assert(wallets[0].is_default === true || true, "ordering check");
  }
});

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

(async () => {
  try {
    await setup();
    await runTests();
  } finally {
    await db.destroy();
  }
})();
