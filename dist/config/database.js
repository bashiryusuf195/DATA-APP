"use strict";
// src/config/database.ts
//
// Exports two database clients:
//
//   supabase  — for auth token verification and calling stored functions
//               (uses the service-role key, which bypasses Row Level Security)
//
//   db        — Knex client for write operations (INSERT, UPDATE, DELETE)
//   dbRead    — Knex client for read operations  (SELECT)
//               In development both point at the same DB.
//               In production, point DATABASE_READ_URL at a read replica.
//
// Both are singletons — created once and reused everywhere.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbRead = exports.db = exports.supabase = void 0;
exports.checkDatabaseHealth = checkDatabaseHealth;
const supabase_js_1 = require("@supabase/supabase-js");
const knex_1 = __importDefault(require("knex"));
const index_1 = require("./index");
// ── Supabase client ───────────────────────────────────────────────────────────
exports.supabase = (0, supabase_js_1.createClient)(index_1.config.supabase.url, index_1.config.supabase.serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
// ── Shared Knex options ───────────────────────────────────────────────────────
const knexBase = {
    client: 'pg',
    useNullAsDefault: true,
    pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30_000,
    },
};
// ── Write connection (primary DB) ─────────────────────────────────────────────
exports.db = (0, knex_1.default)({
    ...knexBase,
    connection: index_1.config.database.writeUrl,
});
// ── Read connection (replica or same DB in dev) ───────────────────────────────
exports.dbRead = (0, knex_1.default)({
    ...knexBase,
    pool: { ...knexBase.pool, max: 20 }, // reads can sustain higher concurrency
    connection: index_1.config.database.readUrl,
});
// ── Health check ──────────────────────────────────────────────────────────────
// Called by GET /api/v1/health to confirm DB is reachable.
async function checkDatabaseHealth() {
    try {
        await exports.db.raw('SELECT 1');
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=database.js.map