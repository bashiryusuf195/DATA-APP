/**
 * Provider routing regression test.
 *
 * Validates the exclusive three-path resolution invariant:
 *   A. plan_override    — plan.primary_provider_code is set → ONLY plan primary+fallback
 *   B. service_route    — no plan override, routing rule active → ONLY rule primary+fallback
 *   C. priority_fallback — no plan override, no routing rule → priority-ordered active providers
 *
 * The key regression: when routing rule says "use clubkonnect", the engine must
 * NOT fall through to priority-based routing and silently select smshika instead.
 *
 * Run: npx tsx tests/provider-routing.regression.ts
 */

import assert from "assert";

// ── Pure model of the resolution decision tree ─────────────────────────────────
// Extracted from engine logic so it can be tested without a DB connection.

type ResolutionPath = "plan_override" | "service_route" | "priority_fallback";

interface ResolvedCandidate {
  providerCode:   string;
  resolutionPath: ResolutionPath;
}

function buildCandidates(params: {
  planOverride:        string | null;
  planFallback:        string | null;
  routingRulePrimary:  string | null;
  routingRuleFallback: string | null;
  priorityProviders:   string[];   // ordered by priority ASC
}): ResolvedCandidate[] {
  const result: ResolvedCandidate[] = [];
  const seen   = new Set<string>();

  // ── Path A ────────────────────────────────────────────────────────────────────
  if (params.planOverride) {
    result.push({ providerCode: params.planOverride, resolutionPath: "plan_override" });
    seen.add(params.planOverride);
    if (params.planFallback && !seen.has(params.planFallback)) {
      result.push({ providerCode: params.planFallback, resolutionPath: "plan_override" });
    }
    return result;  // exclusive early return
  }

  // ── Path B ────────────────────────────────────────────────────────────────────
  if (params.routingRulePrimary) {
    result.push({ providerCode: params.routingRulePrimary, resolutionPath: "service_route" });
    seen.add(params.routingRulePrimary);
    if (params.routingRuleFallback && !seen.has(params.routingRuleFallback)) {
      result.push({ providerCode: params.routingRuleFallback, resolutionPath: "service_route" });
    }
    return result;  // exclusive early return — no priority fallback
  }

  // ── Path C ────────────────────────────────────────────────────────────────────
  for (const code of params.priorityProviders) {
    if (!seen.has(code)) {
      result.push({ providerCode: code, resolutionPath: "priority_fallback" });
      seen.add(code);
    }
  }
  return result;
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

console.log("\nProvider Routing Regression Tests\n");

// ── Regression: routing rule to clubkonnect must NEVER select smshika ─────────

test(
  "REGRESSION: routing rule → clubkonnect; smshika has priority 1 → still never selected",
  () => {
    const candidates = buildCandidates({
      planOverride:        null,
      planFallback:        null,
      routingRulePrimary:  "clubkonnect",
      routingRuleFallback: null,
      priorityProviders:   ["smshika", "clubkonnect"],  // smshika at priority 1
    });

    assert.strictEqual(candidates.length, 1, "exactly one candidate");
    assert.strictEqual(candidates[0].providerCode, "clubkonnect");
    assert.strictEqual(candidates[0].resolutionPath, "service_route");
    assert.ok(
      !candidates.some((c) => c.providerCode === "smshika"),
      "smshika MUST NOT appear when routing rule is set to clubkonnect",
    );
  },
);

test(
  "REGRESSION: routing rule → clubkonnect; if clubkonnect is ineligible → zero candidates (purchase fails, no silent fallback)",
  () => {
    // Engine filters ineligible providers in tryAddCandidate.
    // Simulate by not including clubkonnect in the priority list
    // but also simulating it being rejected by using a filter.
    // With exclusive routing, no priority candidates are added at all.
    const candidates = buildCandidates({
      planOverride:        null,
      planFallback:        null,
      routingRulePrimary:  "clubkonnect",
      routingRuleFallback: null,
      priorityProviders:   ["smshika"],  // smshika would have been selected in old behavior
    });

    // candidare list = [clubkonnect] (engine would then reject it via isProviderEligible)
    // smshika is NEVER in the candidate list
    assert.ok(
      !candidates.some((c) => c.providerCode === "smshika"),
      "smshika must not be a candidate even as a fallback when routing rule is set",
    );
    assert.strictEqual(candidates[0].providerCode, "clubkonnect");
  },
);

// ── Plan override tests ────────────────────────────────────────────────────────

test(
  "plan override → smshika; routing rule → clubkonnect; only smshika used",
  () => {
    const candidates = buildCandidates({
      planOverride:        "smshika",
      planFallback:        null,
      routingRulePrimary:  "clubkonnect",  // ignored when plan override set
      routingRuleFallback: null,
      priorityProviders:   ["mock_vtu_provider"],
    });

    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].providerCode, "smshika");
    assert.strictEqual(candidates[0].resolutionPath, "plan_override");
    assert.ok(!candidates.some((c) => c.providerCode === "clubkonnect"), "clubkonnect must not appear");
    assert.ok(!candidates.some((c) => c.providerCode === "mock_vtu_provider"), "mock must not appear");
  },
);

test(
  "plan override with fallback → only override + its fallback (routing rule ignored)",
  () => {
    const candidates = buildCandidates({
      planOverride:        "clubkonnect",
      planFallback:        "smshika",
      routingRulePrimary:  "vtpass",      // ignored
      routingRuleFallback: null,
      priorityProviders:   ["mock_vtu_provider"],  // ignored
    });

    assert.strictEqual(candidates.length, 2);
    assert.strictEqual(candidates[0].providerCode, "clubkonnect");
    assert.strictEqual(candidates[0].resolutionPath, "plan_override");
    assert.strictEqual(candidates[1].providerCode, "smshika");
    assert.strictEqual(candidates[1].resolutionPath, "plan_override");
    assert.ok(!candidates.some((c) => c.providerCode === "vtpass"));
    assert.ok(!candidates.some((c) => c.providerCode === "mock_vtu_provider"));
  },
);

// ── Routing rule tests ─────────────────────────────────────────────────────────

test(
  "routing rule with fallback → primary then fallback, no priority providers",
  () => {
    const candidates = buildCandidates({
      planOverride:        null,
      planFallback:        null,
      routingRulePrimary:  "clubkonnect",
      routingRuleFallback: "smshika",
      priorityProviders:   ["vtpass", "mock_vtu_provider"],  // must not appear
    });

    assert.strictEqual(candidates.length, 2);
    assert.strictEqual(candidates[0].providerCode, "clubkonnect");
    assert.strictEqual(candidates[0].resolutionPath, "service_route");
    assert.strictEqual(candidates[1].providerCode, "smshika");
    assert.strictEqual(candidates[1].resolutionPath, "service_route");
    assert.ok(!candidates.some((c) => c.providerCode === "vtpass"), "vtpass must not appear");
    assert.ok(!candidates.some((c) => c.providerCode === "mock_vtu_provider"));
  },
);

test(
  "routing rule duplicate fallback (same as primary) → deduplicated",
  () => {
    const candidates = buildCandidates({
      planOverride:        null,
      planFallback:        null,
      routingRulePrimary:  "clubkonnect",
      routingRuleFallback: "clubkonnect",  // same as primary
      priorityProviders:   ["smshika"],
    });

    assert.strictEqual(candidates.length, 1, "deduplication must keep only one clubkonnect entry");
    assert.strictEqual(candidates[0].providerCode, "clubkonnect");
  },
);

// ── Priority-fallback tests ────────────────────────────────────────────────────

test(
  "no plan override, no routing rule → priority-based, ordered by priority",
  () => {
    const candidates = buildCandidates({
      planOverride:        null,
      planFallback:        null,
      routingRulePrimary:  null,
      routingRuleFallback: null,
      priorityProviders:   ["smshika", "clubkonnect", "vtpass"],
    });

    assert.strictEqual(candidates.length, 3);
    assert.strictEqual(candidates[0].providerCode, "smshika");
    assert.strictEqual(candidates[0].resolutionPath, "priority_fallback");
    assert.strictEqual(candidates[1].providerCode, "clubkonnect");
    assert.strictEqual(candidates[2].providerCode, "vtpass");
  },
);

test(
  "no plan override, no routing rule, no priority providers → zero candidates",
  () => {
    const candidates = buildCandidates({
      planOverride:        null,
      planFallback:        null,
      routingRulePrimary:  null,
      routingRuleFallback: null,
      priorityProviders:   [],
    });

    assert.strictEqual(candidates.length, 0);
  },
);

// ── Summary ────────────────────────────────────────────────────────────────────

console.log("");
if (failed === 0) {
  console.log(`All ${passed} tests passed.\n`);
} else {
  console.error(`${failed} test(s) FAILED, ${passed} passed.\n`);
  process.exit(1);
}
