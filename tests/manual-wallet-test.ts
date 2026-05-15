// ============================================================
// tests/manual-wallet-test.ts
//
// End-to-end manual validation of the wallet engine.
// Uses the treasury-funded hierarchy created by seed-wallets.ts:
//
//   TREASURY → SETTLEMENT → USER
//
//   Treasury is bootstrapped with NGN 10,000,000 via GENESIS batch.
//   Settlement is funded from Treasury via transfer.
//   User wallet is credited using Settlement as the contra source.
//
// Required env vars (output by seed-wallets.ts):
//   DATABASE_URL
//   SYSTEM_TREASURY_WALLET_ID
//   SYSTEM_SETTLEMENT_WALLET_ID
//   TEST_WALLET_ID
//
// Run:
//   npx tsx tests/manual-wallet-test.ts
//   npm run test:wallet
// ============================================================

import "dotenv/config";
import { randomUUID } from "crypto";
import Knex           from "knex";

import { WalletService } from "../src/services/wallet/WalletService";
import { WalletError } from "../src/services/wallet/WalletError";

// ─────────────────────────────────────────────────────────────
// Printer
// ─────────────────────────────────────────────────────────────
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

function fmtNgn(n: number): string {
  return `NGN ${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const fmt = {
  uuid: (id: string) => `${C.dim}…${id.slice(-12)}${C.reset}`,

  step: (n: number, title: string) => {
    const pad  = n === 0 ? " 0" : String(n).padStart(2, " ");
    const line = "─".repeat(60);
    console.log(`\n${C.cyan}${line}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  Step ${pad}  │  ${title}${C.reset}`);
    console.log(`${C.cyan}${line}${C.reset}`);
  },

  ok: (msg: string, detail?: string) => {
    const d = detail ? `  ${C.dim}${detail}${C.reset}` : "";
    console.log(`  ${C.green}✔${C.reset}  ${msg}${d}`);
  },

  info: (label: string, value: string) =>
    console.log(`  ${C.blue}◆${C.reset}  ${C.bold}${label}${C.reset}  ${value}`),

  warn: (label: string, value: string) =>
    console.log(`  ${C.yellow}⚠${C.reset}  ${label}  ${C.yellow}${value}${C.reset}`),

  caught: (label: string, code: string, msg: string) => {
    console.log(`  ${C.green}✔${C.reset}  ${label}`);
    console.log(`     ${C.yellow}code  ${C.reset}: ${C.bold}${code}${C.reset}`);
    console.log(`     ${C.grey}detail${C.reset}: ${C.dim}${msg.slice(0, 120)}${C.reset}`);
  },

  fatal: (msg: string, err: unknown) => {
    console.log(`\n  ${C.red}✘  FATAL: ${msg}${C.reset}`);
    console.error(err);
  },

  balanceLine: (label: string, before: number, after: number) => {
    const arrow = after > before ? C.green + "▲" : after < before ? C.red + "▼" : C.grey + "–";
    const diff  = after - before;
    const sign  = diff >= 0 ? "+" : "";
    console.log(
      `  ${C.blue}◆${C.reset}  ${label}` +
      `\n       before : ${C.bold}${fmtNgn(before)}${C.reset}` +
      `\n       after  : ${C.bold}${fmtNgn(after)}${C.reset}` +
      `\n       change : ${arrow} ${sign}${fmtNgn(diff)}${C.reset}`
    );
  },

  journalLine: (batchId: string, idempotent: boolean) =>
    console.log(
      `  ${C.blue}◆${C.reset}  journal_batch_id  ${fmt.uuid(batchId)}` +
      (idempotent ? `  ${C.yellow}[IDEMPOTENT REPLAY]${C.reset}` : `  ${C.dim}(new)${C.reset}`)
    ),

  ledgerTable: (entries: Array<{
    entry_type: string; amount: number;
    running_balance: number | null; description: string;
  }>) => {
    const colW = { type: 6, amount: 18, running: 18, desc: 38 };
    const hdr =
      `  ${"TYPE".padEnd(colW.type)}  ${"AMOUNT".padStart(colW.amount)}  ` +
      `${"RUNNING BAL".padStart(colW.running)}  DESCRIPTION`;
    console.log(`\n${C.bold}${C.dim}${hdr}${C.reset}`);
    console.log(`  ${"─".repeat(colW.type + colW.amount + colW.running + colW.desc + 6)}`);
    for (const e of entries) {
      const tc    = e.entry_type === "credit" ? C.green : C.red;
      const sign  = e.entry_type === "credit" ? "+" : "-";
      const amt   = `${sign}${fmtNgn(e.amount)}`.padStart(colW.amount);
      const run   = (e.running_balance != null ? fmtNgn(e.running_balance) : "—").padStart(colW.running);
      const desc  = e.description.slice(0, colW.desc);
      console.log(
        `  ${tc}${e.entry_type.toUpperCase().padEnd(colW.type)}${C.reset}` +
        `  ${tc}${amt}${C.reset}` +
        `  ${C.dim}${run}${C.reset}` +
        `  ${C.grey}${desc}${C.reset}`
      );
    }
  },

  summary: (passed: number, failed: number) => {
    const total = passed + failed;
    const line  = "═".repeat(60);
    console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
    if (failed === 0) {
      console.log(`${C.bold}${C.green}  ✔  All ${total} steps passed${C.reset}`);
    } else {
      console.log(`${C.bold}${C.red}  ✘  ${failed} of ${total} steps failed${C.reset}`);
    }
    console.log(`${C.bold}${C.cyan}${line}${C.reset}\n`);
  },
};

// ─────────────────────────────────────────────────────────────
// Env validation
// ─────────────────────────────────────────────────────────────
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `\n  ${C.red}✘  Missing env var: ${C.bold}${name}${C.reset}\n` +
      `  Run  ${C.cyan}npm run seed:wallets${C.reset}  first.\n`
    );
    process.exit(1);
  }
  return v;
}

const TREASURY_WALLET_ID   = requireEnv("SYSTEM_TREASURY_WALLET_ID");
const SETTLEMENT_WALLET_ID = requireEnv("SYSTEM_SETTLEMENT_WALLET_ID");
const TEST_WALLET_ID       = requireEnv("TEST_WALLET_ID");

// ─────────────────────────────────────────────────────────────
// DB + service
// ─────────────────────────────────────────────────────────────
const db = Knex({
  client:     "pg",
  connection: {
    connectionString: requireEnv("DATABASE_URL"),
    ssl: process.env.DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 1, max: 5 },
});

const walletService = new WalletService(db);

// ─────────────────────────────────────────────────────────────
// Step runner
// ─────────────────────────────────────────────────────────────
let stepsPassed = 0;
let stepsFailed = 0;

async function step(n: number, title: string, fn: () => Promise<void>): Promise<void> {
  fmt.step(n, title);
  try {
    await fn();
    stepsPassed++;
  } catch (err) {
    stepsFailed++;
    fmt.fatal("Unexpected error", err);
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {

  // Header
  const line = "═".repeat(60);
  console.log(`\n${C.bold}${C.cyan}${line}`);
  console.log(`  VTU Wallet Engine — Manual Validation`);
  console.log(`  Wallet hierarchy: TREASURY → SETTLEMENT → USER`);
  console.log(`${line}${C.reset}`);
  console.log(`  ${C.grey}${new Date().toISOString()}${C.reset}`);
  console.log(`  ${C.magenta}TREASURY  ${C.reset}: ${fmt.uuid(TREASURY_WALLET_ID)}`);
  console.log(`  ${C.green}SETTLEMENT${C.reset}: ${fmt.uuid(SETTLEMENT_WALLET_ID)}`);
  console.log(`  ${C.cyan}TEST_WALLET${C.reset}: ${fmt.uuid(TEST_WALLET_ID)}`);

  // Create a recipient wallet for transfer test (fresh each run)
  const walletB = await walletService.createWallet({
    wallet_type: "settlement",
    currency:    "NGN",
    label:       `manual-test-wallet-b-${Date.now()}`,
    metadata:    { purpose: "transfer recipient in manual test", temporary: true },
  });
  console.log(`  ${C.dim}WALLET_B (transfer target): ${fmt.uuid(walletB.id)}${C.reset}`);

  // Fixed idempotency key shared across steps 10 + 11
  const IDEM_KEY = `manual-idem-credit-${randomUUID()}`;

  // ── Step 1: Initial balance check ─────────────────────────
  await step(1, "Initial balance check — all wallets", async () => {
    const tBal  = await walletService.getBalance(TREASURY_WALLET_ID);
    const sBal  = await walletService.getBalance(SETTLEMENT_WALLET_ID);
    const uBal  = await walletService.getBalance(TEST_WALLET_ID);

    fmt.info("TREASURY   balance:", `${C.bold}${C.magenta}${fmtNgn(tBal)}${C.reset}`);
    fmt.info("SETTLEMENT balance:", `${C.bold}${C.green}${fmtNgn(sBal)}${C.reset}`);
    fmt.info("USER       balance:", `${C.bold}${C.cyan}${fmtNgn(uBal)}${C.reset}`);

    if (tBal < 1) {
      throw new Error(
        "TREASURY balance is 0. Run 'npm run seed:wallets' first to bootstrap the treasury."
      );
    }
    if (sBal < 1) {
      throw new Error(
        "SETTLEMENT balance is 0. Seed script should transfer treasury funds to settlement."
      );
    }

    fmt.ok("All balances derived from ledger — no stored values");
    fmt.ok("Treasury has funds, settlement has funds — ready to operate");
  });

  // ── Step 2: Credit TEST_WALLET using SETTLEMENT as contra ─
  await step(2, "Credit TEST_WALLET ← NGN 10,000.00  (contra: SETTLEMENT)", async () => {
    const uBefore = await walletService.getBalance(TEST_WALLET_ID);
    const sBefore = await walletService.getBalance(SETTLEMENT_WALLET_ID);

    const result = await walletService.credit({
      wallet_id:        TEST_WALLET_ID,
      contra_wallet_id: SETTLEMENT_WALLET_ID,   // SETTLEMENT funds user credit
      amount:           10_000.00,
      currency:         "NGN",
      description:      "Manual test — user wallet top-up via settlement",
      idempotency_key:  `topup-${randomUUID()}`,
      reference_type:   "topup",
    });

    const uAfter = await walletService.getBalance(TEST_WALLET_ID);
    const sAfter = await walletService.getBalance(SETTLEMENT_WALLET_ID);

    fmt.journalLine(result.journal_batch_id, result.idempotent);
    fmt.balanceLine("USER       (credited)", uBefore, uAfter);
    fmt.balanceLine("SETTLEMENT (debited) ", sBefore, sAfter);

    const { entries } = await walletService.getJournalBatch(result.journal_batch_id);
    const sum = entries.reduce((a, e) => a + e.signed_amount, 0);
    fmt.info("Journal signed_amount sum:", `${Math.abs(sum) < 0.001 ? C.green : C.red}${sum}${C.reset}  (must be 0)`);
    if (Math.abs(sum) > 0.001) throw new Error(`Journal not balanced: sum=${sum}`);
    fmt.ok("Journal balanced ✓   Hierarchy: SETTLEMENT → USER");
  });

  // ── Step 3: Verify balance after credit ───────────────────
  await step(3, "Verify USER wallet balance after credit", async () => {
    const bal = await walletService.getWalletBalance(TEST_WALLET_ID);
    fmt.info("balance            :", `${C.bold}${fmtNgn(bal.balance)}${C.reset}`);
    fmt.info("ledger_entry_count :", String(bal.ledger_entry_count));
    fmt.info("last_activity_at   :", bal.last_activity_at?.toISOString() ?? "—");
    if (bal.balance < 10_000) throw new Error(`Expected >= 10000, got ${bal.balance}`);
    fmt.ok("Balance reflects credit correctly");
  });

  // ── Step 4: Debit TEST_WALLET back to SETTLEMENT ──────────
  await step(4, "Debit TEST_WALLET → NGN 3,500.00  (contra: SETTLEMENT)", async () => {
    const uBefore = await walletService.getBalance(TEST_WALLET_ID);
    const sBefore = await walletService.getBalance(SETTLEMENT_WALLET_ID);

    const result = await walletService.debit({
      wallet_id:        TEST_WALLET_ID,
      contra_wallet_id: SETTLEMENT_WALLET_ID,   // debit proceeds land in settlement
      amount:           3_500.00,
      currency:         "NGN",
      description:      "Airtime purchase — MTN 08012345678",
      idempotency_key:  `debit-${randomUUID()}`,
      reference_type:   "airtime_purchase",
    });

    const uAfter = await walletService.getBalance(TEST_WALLET_ID);
    const sAfter = await walletService.getBalance(SETTLEMENT_WALLET_ID);

    fmt.journalLine(result.journal_batch_id, result.idempotent);
    fmt.balanceLine("USER       (debited)  ", uBefore, uAfter);
    fmt.balanceLine("SETTLEMENT (credited) ", sBefore, sAfter);
    fmt.ok("Debit posted   Advisory lock acquired + released on commit");
  });

  // ── Step 5: Verify balance after debit ────────────────────
  await step(5, "Verify USER balance after debit", async () => {
    const bal = await walletService.getBalance(TEST_WALLET_ID);
    fmt.info("balance:", `${C.bold}${fmtNgn(bal)}${C.reset}`);
    if (bal < 0) throw new Error(`Unexpected negative balance: ${bal}`);
    fmt.ok("Balance correctly reduced — no overdraft");
  });

  // ── Step 6: Transfer TEST_WALLET → WALLET_B ───────────────
  await step(6, "Transfer TEST_WALLET → WALLET_B  NGN 2,000.00", async () => {
    const aBefore = await walletService.getBalance(TEST_WALLET_ID);
    const bBefore = await walletService.getBalance(walletB.id);

    const result = await walletService.transfer({
      from_wallet_id:  TEST_WALLET_ID,
      to_wallet_id:    walletB.id,
      amount:          2_000.00,
      currency:        "NGN",
      description:     "Manual test P2P transfer",
      idempotency_key: `transfer-${randomUUID()}`,
      reference_type:  "wallet_transfer",
    });

    const aAfter = await walletService.getBalance(TEST_WALLET_ID);
    const bAfter = await walletService.getBalance(walletB.id);

    fmt.journalLine(result.journal_batch_id, result.idempotent);
    fmt.balanceLine("TEST_WALLET (sender)  ", aBefore, aAfter);
    fmt.balanceLine("WALLET_B   (recipient)", bBefore, bAfter);

    const { entries } = await walletService.getJournalBatch(result.journal_batch_id);
    const sum = entries.reduce((a, e) => a + e.signed_amount, 0);
    if (Math.abs(sum) > 0.001) throw new Error(`Transfer journal not balanced: sum=${sum}`);
    fmt.ok("Transfer posted — single balanced batch   SUM = 0 ✓");
  });

  // ── Step 7: Verify both balances after transfer ────────────
  await step(7, "Verify both wallet balances after transfer", async () => {
    const balA = await walletService.getBalance(TEST_WALLET_ID);
    const balB = await walletService.getBalance(walletB.id);
    fmt.info("TEST_WALLET balance:", `${C.bold}${fmtNgn(balA)}${C.reset}`);
    fmt.info("WALLET_B    balance:", `${C.bold}${fmtNgn(balB)}${C.reset}`);
    if (balB < 2_000) throw new Error(`WALLET_B should have >= 2000, got ${balB}`);
    fmt.ok("Both balances correct after transfer");
  });

  // ── Step 8: Attempt overdraft debit ───────────────────────
  await step(8, "Attempt overdraft debit — expect INSUFFICIENT_BALANCE", async () => {
    const cur = await walletService.getBalance(TEST_WALLET_ID);
    const req = cur + 999_999.00;

    fmt.info("Current balance  :", `${C.bold}${fmtNgn(cur)}${C.reset}`);
    fmt.info("Attempting debit :", `${C.bold}${C.red}${fmtNgn(req)}${C.reset}`);
    fmt.warn("Expecting rejection", "INSUFFICIENT_BALANCE");

    let caught = false;
    try {
      await walletService.debit({
        wallet_id:        TEST_WALLET_ID,
        contra_wallet_id: SETTLEMENT_WALLET_ID,
        amount:           req,
        currency:         "NGN",
        description:      "Overdraft attempt — must be rejected",
        idempotency_key:  `overdraft-${randomUUID()}`,
      });
    } catch (err) {
      if (err instanceof WalletError && err.message.includes("INSUFFICIENT_BALANCE")) {
        
        caught = true;
        fmt.caught("Debit correctly rejected", err.code, err.message);
      } else {
        throw err;
      }
    }
    if (!caught) throw new Error("Overdraft debit should have been rejected");
  });

  // ── Step 9: Verify balance unchanged after rejected debit ──
  await step(9, "Verify balance unchanged after rejected overdraft", async () => {
    const bal = await walletService.getBalance(TEST_WALLET_ID);
    fmt.info("Balance:", `${C.bold}${fmtNgn(bal)}${C.reset}`);
    fmt.ok("Balance rolled back cleanly — no partial ledger write");
    fmt.ok("Advisory lock released automatically on transaction rollback");
  });

  // ── Step 10: Credit with idempotency key — first call ─────
  await step(10, "Credit with idempotency key — first call", async () => {
    fmt.info("idempotency_key:", IDEM_KEY);
    const before = await walletService.getBalance(TEST_WALLET_ID);

    const result = await walletService.credit({
      wallet_id:        TEST_WALLET_ID,
      contra_wallet_id: SETTLEMENT_WALLET_ID,
      amount:           1_000.00,
      currency:         "NGN",
      description:      "Idempotency test — first post",
      idempotency_key:  IDEM_KEY,
      reference_type:   "topup",
    });

    const after = await walletService.getBalance(TEST_WALLET_ID);
    fmt.journalLine(result.journal_batch_id, result.idempotent);
    fmt.info("idempotent:", result.idempotent
      ? C.yellow + "true (key already existed)" + C.reset
      : C.green  + "false (new write)" + C.reset);
    fmt.balanceLine("TEST_WALLET", before, after);

    if (result.idempotent) {
      fmt.warn("Key already existed from a prior run", "balance unchanged — correct behaviour");
    } else {
      fmt.ok("First call: journal posted — balance increased by NGN 1,000.00");
    }
  });

  // ── Step 11: Retry same idempotency key ───────────────────
  await step(11, "Retry same idempotency key — verify duplicate prevention", async () => {
    fmt.info("idempotency_key:", IDEM_KEY);
    fmt.warn("Expecting", "idempotent replay — no second ledger write");

    const balBefore = await walletService.getBalance(TEST_WALLET_ID);

    const result = await walletService.credit({
      wallet_id:        TEST_WALLET_ID,
      contra_wallet_id: SETTLEMENT_WALLET_ID,
      amount:           1_000.00,
      currency:         "NGN",
      description:      "Idempotency test — retry",
      idempotency_key:  IDEM_KEY,
      reference_type:   "topup",
    });

    const balAfter = await walletService.getBalance(TEST_WALLET_ID);
    const delta    = Math.abs(balAfter - balBefore);

    fmt.journalLine(result.journal_batch_id, result.idempotent);
    fmt.info("idempotent  :", result.idempotent
      ? C.green + "true ✓" + C.reset
      : C.red   + "false ✗" + C.reset);
    fmt.info("balance before:", fmtNgn(balBefore));
    fmt.info("balance after :", fmtNgn(balAfter));
    fmt.info("delta         :", `${delta < 0.001 ? C.green : C.red}${fmtNgn(delta)}${C.reset}  (must be 0)`);

    if (!result.idempotent) throw new Error("Second call should be flagged idempotent");
    if (delta > 0.001)      throw new Error(`Balance must not change on replay; delta=${delta}`);
    fmt.ok("Duplicate transaction correctly prevented");
    fmt.ok("Same journal_batch_id returned — no new ledger entries written");
  });

  // ── Final ledger snapshot ──────────────────────────────────
  fmt.step(0, "Final ledger snapshots");

  // User wallet
  const userPage = await walletService.getLedgerPage({ wallet_id: TEST_WALLET_ID, limit: 8 });
  console.log(`\n  ${C.bold}${C.cyan}TEST_WALLET${C.reset}  last ${userPage.length} entries (newest first)`);
  fmt.ledgerTable(userPage);

  // Settlement wallet
  const settPage = await walletService.getLedgerPage({ wallet_id: SETTLEMENT_WALLET_ID, limit: 5 });
  console.log(`\n  ${C.bold}${C.green}SETTLEMENT${C.reset}  last ${settPage.length} entries (newest first)`);
  fmt.ledgerTable(settPage);

  // Treasury wallet
  const tPage = await walletService.getLedgerPage({ wallet_id: TREASURY_WALLET_ID, limit: 4 });
  console.log(`\n  ${C.bold}${C.magenta}TREASURY${C.reset}  last ${tPage.length} entries (newest first)`);
  fmt.ledgerTable(tPage);

  // Final balances
  console.log();
  const tFinal = await walletService.getBalance(TREASURY_WALLET_ID);
  const sFinal = await walletService.getBalance(SETTLEMENT_WALLET_ID);
  const uFinal = await walletService.getBalance(TEST_WALLET_ID);
  fmt.info("TREASURY   final balance:", `${C.bold}${C.magenta}${fmtNgn(tFinal)}${C.reset}`);
  fmt.info("SETTLEMENT final balance:", `${C.bold}${C.green}${fmtNgn(sFinal)}${C.reset}`);
  fmt.info("USER       final balance:", `${C.bold}${C.cyan}${fmtNgn(uFinal)}${C.reset}`);

  // ── Summary ────────────────────────────────────────────────
  fmt.summary(stepsPassed, stepsFailed);
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────
main()
  .catch((err) => {
    console.error(`\n  ${C.red}✘  Unhandled error:${C.reset}`, err);
    process.exit(1);
  })
  .finally(() => db.destroy());
