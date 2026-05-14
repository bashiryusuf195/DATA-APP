// ============================================================
// src/db/knex.ts
//
// Knex singleton for the wallet engine.
// Import this wherever you need database access.
// ============================================================

import Knex from "knex";

function createDb(): Knex.Knex {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
      "Set it to your Supabase / PostgreSQL connection string."
    );
  }

  return Knex({
    client: "pg",
    connection: {
      connectionString,
      ssl: process.env.DB_SSL !== "false"
        ? { rejectUnauthorized: false }
        : false,
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30_000,
      idleTimeoutMillis: 600_000,
    },
    // Never wrap migrations in automatic transactions — partition DDL requires it.
    migrations: {
      disableTransactions: true,
    },
  });
}

// Singleton — reuse connection pool across the process lifetime
let _db: Knex.Knex | undefined;

export function getDb(): Knex.Knex {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export async function destroyDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = undefined;
  }
}

export default getDb;
