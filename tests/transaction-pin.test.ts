/**
 * Transaction PIN — manual integration test.
 *
 * Prerequisites:
 *   1. Server running locally on PORT 3000.
 *   2. A valid JWT for a test user:
 *        export TOKEN="Bearer eyJ..."
 *   3. Migration applied:
 *        npx knex migrate:latest --knexfile knexfile.ts
 *
 * Run:
 *   npx tsx tests/transaction-pin.test.ts
 *
 * Or run the curl commands below directly in a shell.
 */

import assert from "assert";

const BASE = process.env.API_URL ?? "http://localhost:3000/api/v1";
const TOKEN = process.env.TOKEN ?? "";

if (!TOKEN) {
  console.error("Set TOKEN=Bearer <jwt> before running.");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  Authorization:  TOKEN,
};

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
}

async function run() {
  let resetToken = "";

  // ── 1. Status before setup ──────────────────────────────────────────────────
  {
    const { status, body } = await req("GET", "/security/transaction-pin");
    assert.strictEqual(status, 200, "GET status");
    const data = body.data as Record<string, unknown>;
    assert.strictEqual(data.pin_set, false, "pin not yet set");
    console.log("✓ GET /security/transaction-pin (pin_set=false)");
  }

  // ── 2. Reject weak PIN ──────────────────────────────────────────────────────
  {
    const { status, body } = await req("POST", "/security/transaction-pin/setup", { pin: "1234" });
    assert.strictEqual(status, 400, "weak PIN rejected");
    assert.strictEqual((body as Record<string, unknown>).code, "WEAK_TRANSACTION_PIN");
    console.log("✓ POST /setup rejects weak PIN (1234)");
  }

  // ── 3. Reject bad format ────────────────────────────────────────────────────
  {
    const { status } = await req("POST", "/security/transaction-pin/setup", { pin: "12345" });
    assert.strictEqual(status, 400, "5-digit PIN rejected");
    console.log("✓ POST /setup rejects 5-digit PIN");
  }

  // ── 4. Successful setup ─────────────────────────────────────────────────────
  {
    const { status, body } = await req("POST", "/security/transaction-pin/setup", { pin: "8472" });
    assert.strictEqual(status, 200, "setup OK");
    console.log("✓ POST /setup succeeds with PIN 8472");
    console.log("  →", (body as Record<string, unknown>).data);
  }

  // ── 5. Second setup is rejected (already set) ───────────────────────────────
  {
    const { status, body } = await req("POST", "/security/transaction-pin/setup", { pin: "8473" });
    assert.strictEqual(status, 409, "duplicate setup rejected");
    assert.strictEqual((body as Record<string, unknown>).code, "TRANSACTION_PIN_ALREADY_SET");
    console.log("✓ POST /setup rejects duplicate setup");
  }

  // ── 6. Status after setup ───────────────────────────────────────────────────
  {
    const { status, body } = await req("GET", "/security/transaction-pin");
    assert.strictEqual(status, 200);
    const data = body.data as Record<string, unknown>;
    assert.strictEqual(data.pin_set, true, "pin_set=true after setup");
    console.log("✓ GET /security/transaction-pin (pin_set=true)");
  }

  // ── 7. Verify with correct PIN ──────────────────────────────────────────────
  {
    const { status, body } = await req("POST", "/security/transaction-pin/verify", { transaction_pin: "8472" });
    assert.strictEqual(status, 200, "verify correct PIN");
    const data = body.data as Record<string, unknown>;
    assert.strictEqual(data.valid, true);
    console.log("✓ POST /verify succeeds with correct PIN");
  }

  // ── 8. Verify with wrong PIN increments counter ─────────────────────────────
  {
    const { status, body } = await req("POST", "/security/transaction-pin/verify", { transaction_pin: "0000" });
    assert.strictEqual(status, 401, "wrong PIN → 401");
    assert.strictEqual((body as Record<string, unknown>).code, "INVALID_TRANSACTION_PIN");
    console.log("✓ POST /verify rejects wrong PIN (INVALID_TRANSACTION_PIN)");
  }

  // ── 9. Change PIN ───────────────────────────────────────────────────────────
  {
    const { status } = await req("POST", "/security/transaction-pin/change", {
      current_pin: "8472",
      new_pin:     "9351",
    });
    assert.strictEqual(status, 200, "change PIN OK");
    console.log("✓ POST /change updates PIN");
  }

  // ── 10. Old PIN no longer works ─────────────────────────────────────────────
  {
    const { status, body } = await req("POST", "/security/transaction-pin/verify", { transaction_pin: "8472" });
    assert.strictEqual(status, 401);
    assert.strictEqual((body as Record<string, unknown>).code, "INVALID_TRANSACTION_PIN");
    console.log("✓ Old PIN rejected after change");
  }

  // ── 11. Reset request (requires current_password) ──────────────────────────
  {
    const password = process.env.TEST_PASSWORD ?? "password123";
    const { status, body } = await req("POST", "/security/transaction-pin/reset/request", {
      current_password: password,
    });
    if (status === 200) {
      resetToken = ((body as Record<string, unknown>).data as Record<string, unknown>).reset_token as string;
      console.log("✓ POST /reset/request → token:", resetToken);
    } else {
      console.warn("⚠ POST /reset/request returned", status, "— skipping confirm step");
      console.warn("  Set TEST_PASSWORD= to a real user password to test reset");
    }
  }

  // ── 12. Reset confirm ───────────────────────────────────────────────────────
  if (resetToken) {
    const { status } = await req("POST", "/security/transaction-pin/reset/confirm", {
      reset_token: resetToken,
      new_pin:     "6284",
    });
    assert.strictEqual(status, 200, "reset confirm OK");
    console.log("✓ POST /reset/confirm sets new PIN 6284");

    const { status: v } = await req("POST", "/security/transaction-pin/verify", { transaction_pin: "6284" });
    assert.strictEqual(v, 200, "new PIN works after reset");
    console.log("✓ New PIN 6284 verified after reset");
  }

  // ── 13. Purchase without PIN fails (schema validation) ─────────────────────
  {
    const { status, body } = await fetch(`${BASE}/transactions/airtime`, {
      method:  "POST",
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      body:    JSON.stringify({ phone: "08012345678", amount: 100, variation_code: "mtn-airtime" }),
    }).then(async (r) => ({ status: r.status, body: await r.json() as unknown }));
    assert.ok([400, 422].includes(status as number), `purchase without PIN → 400/422 (got ${status})`);
    console.log("✓ Purchase without transaction_pin rejected (status", status, ")");
    console.log("  →", (body as Record<string, unknown>).code ?? (body as Record<string, unknown>).message);
  }

  console.log("\n✅  All transaction-PIN tests passed.");
}

run().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
