import type { Knex } from "knex";

// ── Why this migration exists ──────────────────────────────────────────────────
//
// Migration 20240101000001_auth_rbac created the users_phone_e164 CHECK
// constraint using a TypeScript template literal:
//
//   phone ~ '^\+[1-9]\d{6,14}$'
//
// JavaScript silently converts unrecognised escape sequences in strings:
//   \+ → +   (backslash dropped, bare + is a regex quantifier)
//   \d → d   (backslash dropped, bare d is a literal character)
//
// PostgreSQL therefore stored the constraint with the pattern:
//   ^+[1-9]d{6,14}$
//
// That regex is syntactically invalid: '+' at position 2 has no preceding
// atom to quantify → "invalid regular expression: quantifier operand invalid".
//
// The error only surfaces when phone IS NOT NULL (because of the short-circuit
// `phone IS NULL OR phone ~ '...'`), so registrations without a phone number
// passed silently while those with one always failed.
//
// Fix: drop and recreate the constraint using character-class syntax that
// requires no backslash escaping.  New pattern: ^[+][1-9][0-9]{6,14}$
//
//   [+]       — character class containing only '+'; unambiguously literal
//   [1-9]     — first country-code digit (non-zero)
//   [0-9]{6,14} — remaining 6–14 digits (E.164 allows 7–15 total digits)
// ─────────────────────────────────────────────────────────────────────────────

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_phone_e164,
      ADD  CONSTRAINT users_phone_e164
        CHECK (phone IS NULL OR phone ~ '^[+][1-9][0-9]{6,14}$')
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Keep the fixed version in both directions — there is no reason to restore
  // a broken constraint.  This no-op preserves rollback symmetry.
  await knex.raw(`
    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_phone_e164,
      ADD  CONSTRAINT users_phone_e164
        CHECK (phone IS NULL OR phone ~ '^[+][1-9][0-9]{6,14}$')
  `);
}
