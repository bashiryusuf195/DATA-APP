/**
 * Slip safety test — ensures generated PDFs contain no baked-in personal data
 * from the old sample PDF templates.
 *
 * Run: npx tsx tests/slip-safety.test.ts
 *
 * Checks that none of the four slip types embed literal strings that appeared
 * in the NIMC sample PDFs that were previously used as backgrounds:
 *   UMAR, ABDULKADIR, 6799, 71296097919 (and related)
 *
 * Also confirms that test-data strings DO appear in the output (smoke-test
 * that rendering completed with real data).
 *
 * pdf-lib encodes drawn text as hex strings inside compressed content streams,
 * e.g. "TESTSURNAME" → <544553545355524E414D45>.  This test decompresses each
 * stream and decodes hex strings before searching.
 */

import assert from "assert";
import zlib from "zlib";
import {
  renderNinInformationSlip,
  renderNinStandardSlip,
  renderNinPremiumSlip,
  renderBvnSlip,
} from "../src/modules/transactions/pdf/slip-renderers";

// ── Fake test data ────────────────────────────────────────────────────────────
const FAKE: Record<string, string> = {
  first_name:              "TESTFIRST",
  middle_name:             "TESTMIDDLE",
  last_name:               "TESTSURNAME",
  date_of_birth:           "1990-06-15",
  gender:                  "MALE",
  marital_status:          "SINGLE",
  id_number:               "11122233344",
  nin:                     "11122233344",
  bvn:                     "22233344455",
  phone:                   "08100000001",
  tracking_id:             "TRK-999999",
  residence_state:         "TESTSTATE",
  residence_lga:           "TESTLGA",
  birth_state:             "TESTBIRTHSTATE",
  birth_lga:               "TESTBIRTHLGA",
  address:                 "1 TEST STREET, TESTTOWN",
  origin_state:            "TESTORIGINSTATE",
  origin_lga:              "TESTORIGINLGA",
  enrollment_institution:  "TEST BANK",
  enrollment_branch:       "TEST BRANCH",
  photo:                   "",          // no photo — avoid image-embed path
};

function g(key: string): string {
  return FAKE[key] ?? "";
}

// ── PDF text extraction ───────────────────────────────────────────────────────
// pdf-lib stores drawn text as hex strings inside FlateDecode content streams.
// Example: page.drawText("TESTSURNAME") → <544553545355524E414D45> in stream.
// We must decompress each stream and decode hex / literal strings.

function hexDecode(hex: string): string {
  const clean = hex.replace(/\s/g, "");
  let out = "";
  for (let i = 0; i < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

function extractDecodedText(buf: Buffer): string {
  const latin1   = buf.toString("latin1");
  const decoded: string[] = [];

  let pos = 0;
  while (true) {
    // Find the next stream keyword (PDF allows LF or CRLF)
    let si   = latin1.indexOf("stream\n",   pos); let skip = 7;
    if (si === -1) { si = latin1.indexOf("stream\r\n", pos); skip = 8; }
    if (si === -1) break;

    const dataStart = si + skip;
    const ei        = latin1.indexOf("\nendstream", dataStart);
    if (ei === -1) break;

    const streamBuf = buf.slice(dataStart, ei);
    let streamText: string;
    try {
      streamText = zlib.inflateSync(streamBuf).toString("binary");
    } catch {
      try { streamText = zlib.inflateRawSync(streamBuf).toString("binary"); }
      catch { streamText = streamBuf.toString("binary"); }
    }

    // Hex strings <ABCDEF…>
    for (const m of streamText.matchAll(/<([0-9A-Fa-f][0-9A-Fa-f\s]*)>/g)) {
      decoded.push(hexDecode(m[1]));
    }

    // Literal strings (text) — basic extraction without escape handling
    for (const m of streamText.matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g)) {
      decoded.push(m[1].replace(/\\(.)/g, "$1")); // unescape \n \( \) etc.
    }

    pos = ei + 10;
  }

  return decoded.join("\n");
}

// ── Strings that must NOT appear in generated PDF text ────────────────────────
const FORBIDDEN = [
  "UMAR",
  "ABDULKADIR",
  "71296097919",
];

// Strings that MUST appear — verifies fake data was actually rendered.
const REQUIRED = [
  "TESTSURNAME",
  "TESTFIRST",
];

function checkBuffer(name: string, buf: Buffer): void {
  assert.ok(buf.length > 1000, `[${name}] Generated PDF is suspiciously small (${buf.length} bytes)`);

  const text = extractDecodedText(buf);

  for (const forbidden of FORBIDDEN) {
    assert.ok(
      !text.includes(forbidden),
      `[${name}] FAIL: PDF text contains forbidden string "${forbidden}" — ` +
        "old sample data may still be embedded.",
    );
  }

  for (const required of REQUIRED) {
    assert.ok(
      text.includes(required),
      `[${name}] FAIL: PDF text does not contain expected test string "${required}" — ` +
        "data may not be rendering correctly.",
    );
  }

  console.log(`  [${name}] PASS — ${buf.length} bytes, forbidden strings absent, required strings present.`);
}

// ── Run tests ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("Slip safety test — generating four PDFs with fake test data...\n");

  const fakeRef = "TEST-REF-000";
  const fakeTx  = { created_at: "2024-01-01T00:00:00Z" };

  const slips: [string, () => Promise<Buffer>][] = [
    ["nin-information", () => renderNinInformationSlip(g, fakeRef)],
    ["nin-standard",    () => renderNinStandardSlip(g, fakeRef)],
    ["nin-premium",     () => renderNinPremiumSlip(g, fakeTx, fakeRef)],
    ["bvn-basic",       () => renderBvnSlip(g, fakeRef)],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, render] of slips) {
    try {
      const buf = await render();
      checkBuffer(name, buf);
      passed++;
    } catch (err) {
      console.error(`  [${name}] FAIL:`, (err as Error).message);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
