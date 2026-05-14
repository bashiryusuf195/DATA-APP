// ============================================================
// tests/helpers.ts
//
// Shared test utilities: DB setup, fixture creation, assertions.
// These helpers are intentionally dependency-free (no Jest/Vitest
// required) so the test scripts can be run with:
//   npx tsx tests/wallet.test.ts
// ============================================================

import type { Knex } from "knex";
import { randomUUID } from "crypto";

// ── Console colours ───────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};

// ── Assertion helpers ─────────────────────────────────────────

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}\n  expected: ${JSON.stringify(expected)}\n  got:      ${JSON.stringify(actual)}`
    );
  }
}

export function assertApprox(actual: number, expected: number, label: string, tolerance = 0.001): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${label}\n  expected: ~${expected}\n  got:      ${actual}`
    );
  }
}

// ── Test runner ───────────────────────────────────────────────

type TestFn = () => Promise<void>;
interface TestCase { name: string; fn: TestFn }

const _tests: TestCase[] = [];
let _passed = 0;
let _failed = 0;

export function test(name: string, fn: TestFn): void {
  _tests.push({ name, fn });
}

export async function runTests(): Promise<void> {
  console.log(`\n${c.bold}${c.cyan}═══ Wallet Engine Tests ═══${c.reset}\n`);

  for (const t of _tests) {
    try {
      await t.fn();
      console.log(`  ${c.green}✔${c.reset} ${t.name}`);
      _passed++;
    } catch (err) {
      console.log(`  ${c.red}✘${c.reset} ${t.name}`);
      console.log(`    ${c.dim}${(err as Error).message}${c.reset}`);
      _failed++;
    }
  }

  const total = _passed + _failed;
  const summary = _failed === 0
    ? `${c.green}${c.bold}All ${total} tests passed${c.reset}`
    : `${c.red}${c.bold}${_failed} of ${total} tests failed${c.reset}`;

  console.log(`\n  ${summary}\n`);

  if (_failed > 0) process.exit(1);
}

// ── Fixture factories ─────────────────────────────────────────

/**
 * Creates a bare-minimum user row sufficient for wallet FK constraints.
 * Returns the user id.
 */
export async function createTestUser(db: Knex, overrides: Record<string, unknown> = {}): Promise<string> {
  const email = `test+${randomUUID()}@example.com`;
  const [user] = await db("users")
    .insert({
      email,
      status:    "active",
      kyc_level: "none",
      ...overrides,
    })
    .returning("id");
  return user.id as string;
}

/**
 * Creates a system wallet (no user_id) for use as contra wallet in tests.
 * wallet_type must be 'settlement', 'fee', 'commission', or 'escrow'.
 */
export async function createSystemWallet(
  db: Knex,
  type: "settlement" | "fee" | "commission" | "escrow" = "settlement",
  currency = "NGN"
): Promise<string> {
  const [wallet] = await db("wallets")
    .insert({
      wallet_type: type,
      currency,
      status:      "active",
      label:       `test_${type}_${currency}`,
      metadata:    JSON.stringify({ test: true }),
    })
    .returning("id");
  return wallet.id as string;
}

/**
 * Prints a divider line for visual grouping in test output.
 */
export function section(title: string): void {
  console.log(`\n  ${c.yellow}── ${title} ──${c.reset}`);
}
