import knex from "knex";

const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
      }
    : {
        host:     process.env.DB_HOST     ?? "localhost",
        port:     Number(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME     ?? "postgres",
        user:     process.env.DB_USER     ?? "postgres",
        password: process.env.DB_PASSWORD ?? "",
        ssl: process.env.DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
      },
  pool: {
    min:                  2,
    max:                  10,
    acquireTimeoutMillis: 30_000,
    idleTimeoutMillis:    600_000,
  },
});

export function getDbInstance() {
  return db;
}

export default db;
