import type { Knex } from "knex";

// ============================================================
// knexfile.ts — Knex configuration for Supabase PostgreSQL
//
// Environment variables:
//   DATABASE_URL  — full Supabase connection string (preferred)
//   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD / DB_SSL
//
// IMPORTANT: disableTransactions: true is required on migrations
// that operate on partitioned tables. PostgreSQL does not support
// CREATE TABLE ... PARTITION OF inside a transaction block in
// some edge cases, and CREATE INDEX on partitioned tables may
// behave unexpectedly inside a transaction. Each migration file
// manages its own consistency.
// ============================================================

const baseConnection: Knex.PgConnectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host:     process.env.DB_HOST     ?? "localhost",
      port:     Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME     ?? "postgres",
      user:     process.env.DB_USER     ?? "postgres",
      password: process.env.DB_PASSWORD ?? "",
      ssl: process.env.DB_SSL !== "false"
        ? { rejectUnauthorized: false }
        : false,
    };

const sharedConfig: Knex.Config = {
  client: "pg",
  connection: baseConnection,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30_000,
    idleTimeoutMillis: 600_000,
  },
  migrations: {
    directory: "./migrations",
    extension: "ts",
    tableName: "knex_migrations",
    // Disable transaction wrapping so partition DDL works correctly.
    // Each migration is responsible for its own atomicity.
    disableTransactions: true,
  },
};

const config: { [env: string]: Knex.Config } = {
  development: { ...sharedConfig, debug: true },
  test: {
    ...sharedConfig,
    connection: {
      ...(typeof baseConnection === "object" ? baseConnection : {}),
      database: process.env.DB_TEST_NAME ?? "vtu_test",
    } as Knex.PgConnectionConfig,
  },
  production: {
    ...sharedConfig,
    pool: { min: 5, max: 20, acquireTimeoutMillis: 30_000, idleTimeoutMillis: 600_000 },
  },
};

export default config;
