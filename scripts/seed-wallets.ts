// ============================================================
// scripts/seed-wallets.ts
//
// Creates the full wallet hierarchy needed for manual testing:
//
//   TREASURY wallet        — money creation origin
//   GENESIS_EQUITY wallet  — double-entry contra for bootstrap
//   SYSTEM_SETTLEMENT      — operational settlement account
//   TEST_USER + wallet     — consumer user wallet
//
// Flow after seed:
//   bootstrap_treasury_wallet()        → TREASURY gets NGN 10,000,000
//   transfer TREASURY → SETTLEMENT     → fund the settlement account
//   credit_wallet(contra=SETTLEMENT)   → fund user wallets
//
// Idempotent: re-running reuses existing wallets/users by label.
//
// Run:
//   npx tsx scripts/seed-wallets.ts
//   npm run seed:wallets
// ============================================================

import "dotenv/config";
import Knex from "knex";
import { WalletService } from "../src/services/wallet/WalletService";

// ── Terminal colours ──────────────────────────────────────────
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  grey:    "\x1b[90m",
};

function log(symbol: string, color: string, label: string, value?: string): void {
  const val = value !== undefined ? `  ${C.dim}${value}${C.reset}` : "";
  console.log(`  ${color}${symbol}${C.reset} ${C.bold}${label}${C.reset}${val}`);
}

function divider(title: string): void {
  const line = "─".repeat(54);
  console.log(`\n${C.cyan}${line}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
  console.log(`${C.cyan}${line}${C.reset}\n`);
}

function subheader(title: string): void {
  console.log(`\n  ${C.magenta}▸ ${title}${C.reset}`);
}

function envBlock(vars: Record<string, string>): void {
  console.log(`\n${C.yellow}  ┌─ Copy to .env ────────────────────────────────────┐${C.reset}`);
  for (const [key, val] of Object.entries(vars)) {
    console.log(`${C.yellow}  │${C.reset}  ${C.bold}${key}${C.reset}=${C.green}${val}${C.reset}`);
  }
  console.log(`${C.yellow}  └───────────────────────────────────────────────────┘${C.reset}\n`);
}

function fmtNgn(n: number): string {
  return `NGN ${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

// ── DB setup ──────────────────────────────────────────────────
const db = Knex({
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL!,
    ssl: process.env.DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 1, max: 3 },
});

const walletService = new WalletService(db);

// ── Idempotent wallet finder/creator ─────────────────────────
async function findOrCreateWallet(opts: {
  label:       string;
  wallet_type: string;
  currency:    string;
  user_id?:    string | null;
}): Promise<{ id: string; isNew: boolean }> {
  const query = db("wallets").where({
    label:       opts.label,
    wallet_type: opts.wallet_type,
  });
  if (opts.user_id !== undefined) {
    query.where({ user_id: opts.user_id });
  }
  const existing = await query.first("id");

  if (existing) {
    return { id: existing.id as string, isNew: false };
  }

  const wallet = await walletService.createWallet({
    user_id:     opts.user_id ?? null,
    wallet_type: opts.wallet_type as any,
    currency:    opts.currency,
    label:       opts.label,
    metadata:    { seeded: true, seeded_at: new Date().toISOString() },
  });
  return { id: wallet.id, isNew: true };
}

// ── Main seed ─────────────────────────────────────────────────
async function seed(): Promise<void> {
  divider("VTU Wallet Engine — Seed (Treasury-aware)");

  // ── 1. TREASURY wallet ────────────────────────────────────
  subheader("TREASURY wallet");
  const treasury = await findOrCreateWallet({
    label:       "SYSTEM_TREASURY",
    wallet_type: "treasury",
    currency:    "NGN",
    user_id:     null,
  });
  log(treasury.isNew ? "✔" : "↩", treasury.isNew ? C.green : C.yellow,
    treasury.isNew ? "SYSTEM_TREASURY created" : "SYSTEM_TREASURY reused",
    treasury.id);

  // ── 2. GENESIS_EQUITY wallet ──────────────────────────────
  // Absorbs the contra DEBIT during bootstrap so the ledger
  // stays globally balanced (SUM signed_amount = 0).
  subheader("GENESIS_EQUITY wallet (bootstrap contra)");
  const equity = await findOrCreateWallet({
    label:       "GENESIS_EQUITY",
    wallet_type: "treasury",
    currency:    "NGN",
    user_id:     null,
  });
  log(equity.isNew ? "✔" : "↩", equity.isNew ? C.green : C.yellow,
    equity.isNew ? "GENESIS_EQUITY created" : "GENESIS_EQUITY reused",
    equity.id);

  // ── 3. Bootstrap the TREASURY with NGN 10,000,000 ─────────
  subheader("Bootstrap TREASURY → NGN 10,000,000");
  const BOOTSTRAP_AMOUNT = 10_000_000;

  const bootstrapResult = await walletService.bootstrapTreasury({
    treasury_wallet_id: treasury.id,
    equity_wallet_id:   equity.id,
    amount:             BOOTSTRAP_AMOUNT,
    currency:           "NGN",
    description:        "GENESIS — System treasury opening balance",
  });

  if (bootstrapResult.idempotent) {
    log("↩", C.yellow, "Treasury already bootstrapped (idempotent replay)");
    log(" ", C.grey,   "batch_id :", bootstrapResult.journal_batch_id);
  } else {
    log("✔", C.green,  "GENESIS batch posted");
    log(" ", C.grey,   "batch_id :", bootstrapResult.journal_batch_id);
    log(" ", C.grey,   "amount   :", fmtNgn(BOOTSTRAP_AMOUNT));
  }

  const treasuryBalance = await walletService.getBalance(treasury.id);
  log(" ", C.cyan, "Treasury balance :", `${C.bold}${fmtNgn(treasuryBalance)}${C.reset}`);

  if (treasuryBalance < BOOTSTRAP_AMOUNT && !bootstrapResult.idempotent) {
    throw new Error(`Bootstrap failed: expected ${BOOTSTRAP_AMOUNT}, got ${treasuryBalance}`);
  }

  // ── 4. SYSTEM_SETTLEMENT wallet ───────────────────────────
  subheader("SYSTEM_SETTLEMENT wallet");
  const settlement = await findOrCreateWallet({
    label:       "SYSTEM_SETTLEMENT",
    wallet_type: "settlement",
    currency:    "NGN",
    user_id:     null,
  });
  log(settlement.isNew ? "✔" : "↩", settlement.isNew ? C.green : C.yellow,
    settlement.isNew ? "SYSTEM_SETTLEMENT created" : "SYSTEM_SETTLEMENT reused",
    settlement.id);

  // ── 5. Fund SETTLEMENT from TREASURY ──────────────────────
  // Transfer 5,000,000 from treasury → settlement so the
  // settlement wallet can act as the contra source for user credits.
  subheader("Fund SETTLEMENT ← TREASURY  NGN 5,000,000");
  const SETTLEMENT_FUND = 5_000_000;
  const SETTLEMENT_IDEM_KEY = `seed:treasury-to-settlement:${settlement.id}`;

  const settlementFundResult = await walletService.transfer({
    from_wallet_id:  treasury.id,
    to_wallet_id:    settlement.id,
    amount:          SETTLEMENT_FUND,
    currency:        "NGN",
    description:     "SEED — Fund settlement account from treasury",
    idempotency_key: SETTLEMENT_IDEM_KEY,
    reference_type:  "treasury_transfer",
  });

  if (settlementFundResult.idempotent) {
    log("↩", C.yellow, "Settlement already funded (idempotent replay)");
  } else {
    log("✔", C.green,  "Settlement funded from treasury");
  }
  log(" ", C.grey, "batch_id :", settlementFundResult.journal_batch_id);

  const settlementBalance = await walletService.getBalance(settlement.id);
  log(" ", C.cyan, "Settlement balance :", `${C.bold}${fmtNgn(settlementBalance)}${C.reset}`);

  // ── 6. TEST_USER ──────────────────────────────────────────
  subheader("TEST_USER");
  const testEmail = "test-wallet-user@vtu-seed.local";
  const existingUser = await db("users").where({ email: testEmail }).first("id");

  let testUserId: string;
  let userIsNew: boolean;

  if (existingUser) {
    testUserId = existingUser.id as string;
    userIsNew  = false;
    log("↩", C.yellow, "TEST_USER reused", testUserId);
  } else {
    const [newUser] = await db("users")
      .insert({
        email:     testEmail,
        status:    "active",
        kyc_level: "none",
        metadata:  JSON.stringify({ seeded: true, purpose: "wallet engine manual test" }),
      })
      .returning("id");
    testUserId = newUser.id as string;
    userIsNew  = true;
    log("✔", C.green, "TEST_USER created", testUserId);
  }
  log(" ", C.grey, "email :", testEmail);
  void userIsNew;

  // ── 7. TEST_USER wallet ───────────────────────────────────
  subheader("TEST_USER wallet");
  const testWallet = await findOrCreateWallet({
    label:       "TEST_USER_WALLET",
    wallet_type: "user",
    currency:    "NGN",
    user_id:     testUserId,
  });
  log(testWallet.isNew ? "✔" : "↩", testWallet.isNew ? C.green : C.yellow,
    testWallet.isNew ? "TEST_USER_WALLET created" : "TEST_USER_WALLET reused",
    testWallet.id);

  // ── 8. Summary ────────────────────────────────────────────
  divider("Seed complete — Wallet IDs");

  log("●", C.magenta, "SYSTEM_TREASURY_WALLET_ID   :", treasury.id);
  log("●", C.magenta, "GENESIS_EQUITY_WALLET_ID    :", equity.id);
  log("●", C.green,   "SYSTEM_SETTLEMENT_WALLET_ID :", settlement.id);
  log("●", C.cyan,    "TEST_USER_ID                :", testUserId);
  log("●", C.cyan,    "TEST_WALLET_ID              :", testWallet.id);

  console.log();
  log(" ", C.grey, "Treasury balance   :", fmtNgn(await walletService.getBalance(treasury.id)));
  log(" ", C.grey, "Settlement balance :", fmtNgn(await walletService.getBalance(settlement.id)));
  log(" ", C.grey, "User balance       :", fmtNgn(await walletService.getBalance(testWallet.id)));

  envBlock({
    SYSTEM_TREASURY_WALLET_ID:   treasury.id,
    GENESIS_EQUITY_WALLET_ID:    equity.id,
    SYSTEM_SETTLEMENT_WALLET_ID: settlement.id,
    TEST_USER_ID:                testUserId,
    TEST_WALLET_ID:              testWallet.id,
  });

  console.log(`  ${C.dim}Wallet hierarchy:  TREASURY → SETTLEMENT → USER${C.reset}`);
  console.log(`  ${C.dim}Run the test:      npm run test:wallet${C.reset}\n`);
}

// ── Entry point ───────────────────────────────────────────────
seed()
  .catch((err) => {
    console.error(`\n  ${C.red}✘ Seed failed:${C.reset}`, err);
    process.exit(1);
  })
  .finally(() => db.destroy());
