/**
 * Development utility — removes mock seed data from the database.
 * Deletes service_plans seeded with mock_vtu_provider and deactivates
 * the mock_vtu_provider config row. Does NOT delete the provider_configs
 * row so that the mock provider code remains usable for local testing.
 *
 * Usage:
 *   npm run clear-mock-data
 *
 * Guard: refuses to run in NODE_ENV=production unless ALLOW_IN_PROD=true
 * is also set.
 */

import "dotenv/config";
import Knex from "knex";

const NODE_ENV      = process.env.NODE_ENV ?? "development";
const ALLOW_IN_PROD = process.env.ALLOW_IN_PROD === "true";

if (NODE_ENV === "production" && !ALLOW_IN_PROD) {
  console.error(
    "[clear-mock-data] Refusing to run in production. " +
    "Set ALLOW_IN_PROD=true to override."
  );
  process.exit(1);
}

const MOCK_PROVIDER = "mock_vtu_provider";

const db = Knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
});

async function run() {
  console.log(`[clear-mock-data] Clearing mock data for provider: ${MOCK_PROVIDER}`);

  const deletedPlans = await db("service_plans")
    .where({ provider_code: MOCK_PROVIDER })
    .delete();
  console.log(`[clear-mock-data] Deleted ${deletedPlans} service_plan rows`);

  const deactivated = await db("provider_configs")
    .where({ provider_code: MOCK_PROVIDER })
    .update({ is_active: false });
  console.log(`[clear-mock-data] Deactivated ${deactivated} provider_config row(s)`);

  console.log("[clear-mock-data] Done.");
}

run()
  .catch((err) => {
    console.error("[clear-mock-data] Error:", err.message);
    process.exit(1);
  })
  .finally(() => db.destroy());
