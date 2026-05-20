/**
 * Development utility — resets a user's password via the Supabase Admin API
 * and clears any local login-lockout state.
 *
 * Usage:
 *   ADMIN_EMAIL=user@example.com NEW_PASSWORD=MyNewPass1 npm run reset-admin-password
 *
 * Guard: refuses to run in NODE_ENV=production unless ALLOW_IN_PROD=true is
 * also set.  Never prints secrets.
 */

import "dotenv/config";
import Knex from "knex";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

// ── Environment guard ─────────────────────────────────────────────────────────

const NODE_ENV       = process.env.NODE_ENV ?? "development";
const ALLOW_IN_PROD  = process.env.ALLOW_IN_PROD === "true";

if (NODE_ENV === "production" && !ALLOW_IN_PROD) {
  console.error(
    "\nERROR: This script must not run in production.\n" +
    "Set ALLOW_IN_PROD=true only if you understand the risk.\n"
  );
  process.exit(1);
}

// ── Required inputs ───────────────────────────────────────────────────────────

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL?.trim();
const NEW_PASSWORD   = process.env.NEW_PASSWORD;

if (!ADMIN_EMAIL) {
  console.error("ERROR: ADMIN_EMAIL is required.\n  ADMIN_EMAIL=user@example.com NEW_PASSWORD=... npm run reset-admin-password");
  process.exit(1);
}
if (!NEW_PASSWORD) {
  console.error("ERROR: NEW_PASSWORD is required.\n  ADMIN_EMAIL=user@example.com NEW_PASSWORD=... npm run reset-admin-password");
  process.exit(1);
}

// Basic password complexity check (matches backend RegisterSchema)
if (NEW_PASSWORD.length < 8) {
  console.error("ERROR: NEW_PASSWORD must be at least 8 characters.");
  process.exit(1);
}
if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(NEW_PASSWORD)) {
  console.error("ERROR: NEW_PASSWORD must contain uppercase, lowercase, and a digit.");
  process.exit(1);
}

// ── Supabase admin client ─────────────────────────────────────────────────────

const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Database connection ───────────────────────────────────────────────────────

const db = Knex({
  client:     "pg",
  connection: process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host:     process.env.DB_HOST     ?? "localhost",
        port:     Number(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME     ?? "postgres",
        user:     process.env.DB_USER     ?? "postgres",
        password: process.env.DB_PASSWORD ?? "",
        ssl:      process.env.DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
      },
  pool: { min: 1, max: 3 },
});

// ── Main ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(`\nResetting password for: ${ADMIN_EMAIL}`);
  console.log(`Environment: ${NODE_ENV}\n`);

  // 1. Look up the local user row
  const user = await db("users")
    .where({ email: ADMIN_EMAIL })
    .whereNull("deleted_at")
    .select("id", "auth_id", "email", "status", "failed_login_attempts", "locked_until")
    .first();

  if (!user) {
    console.error(`ERROR: No user found with email "${ADMIN_EMAIL}" in the local database.`);
    process.exit(1);
  }

  console.log(`Found local user:`);
  console.log(`  id:                     ${user.id}`);
  console.log(`  auth_id:                ${user.auth_id ?? "(not set)"}`);
  console.log(`  status:                 ${user.status}`);
  console.log(`  failed_login_attempts:  ${user.failed_login_attempts ?? 0}`);
  console.log(`  locked_until:           ${user.locked_until ?? "none"}\n`);

  // 2. Reset password in Supabase Auth
  if (user.auth_id) {
    console.log("Updating password in Supabase Auth…");
    const { error } = await supabase.auth.admin.updateUserById(user.auth_id, {
      password: NEW_PASSWORD,
    });
    if (error) {
      console.error(`ERROR: Supabase password update failed: ${error.message}`);
      process.exit(1);
    }
    console.log("  Supabase Auth: OK");
  } else {
    console.warn("  WARN: No auth_id on this user — skipping Supabase Auth update.");
  }

  // 3. Update bcrypt hash + clear lockout in the local users table
  console.log("Updating local users table…");
  const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const newHash = await bcrypt.hash(NEW_PASSWORD!, BCRYPT_ROUNDS);

  await db("users").where({ id: user.id }).update({
    password_hash:          newHash,
    failed_login_attempts:  0,
    locked_until:           null,
    updated_at:             new Date(),
  });
  console.log("  password_hash:         updated");
  console.log("  failed_login_attempts: 0");
  console.log("  locked_until:          null");

  console.log(`\nDone. You can now log in as ${ADMIN_EMAIL}.\n`);
}

run()
  .catch((err: Error) => {
    console.error("Unexpected error:", err.message);
    process.exit(1);
  })
  .finally(() => {
    db.destroy().catch(() => undefined);
  });
