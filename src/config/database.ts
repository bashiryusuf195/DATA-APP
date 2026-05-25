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

import { createClient }    from '@supabase/supabase-js';
import knex, { type Knex } from 'knex';
import ws                   from 'ws';
import { config }           from './index';

// ── Supabase client ───────────────────────────────────────────────────────────
// Node.js < 22 has no native WebSocket. Supabase Realtime requires one even
// though this backend never subscribes to realtime channels. Providing the
// "ws" package as the transport silences the startup warning and prevents the
// crash on Railway (Node 20).
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
    realtime: {
      // ws constructor signature is incompatible with supabase's WebSocketLikeConstructor type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: ws as any,
    },
  }
);

// ── Shared Knex options ───────────────────────────────────────────────────────
const knexBase: Knex.Config = {
  client:     'pg',
  useNullAsDefault: true,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30_000,
  },
};

// ── Write connection (primary DB) ─────────────────────────────────────────────
export const db = knex({
  ...knexBase,
  connection: config.database.writeUrl,
});

// ── Read connection (replica or same DB in dev) ───────────────────────────────
export const dbRead = knex({
  ...knexBase,
  pool: { ...knexBase.pool, max: 20 }, // reads can sustain higher concurrency
  connection: config.database.readUrl,
});

// ── Health check ──────────────────────────────────────────────────────────────
// Called by GET /api/v1/health to confirm DB is reachable.
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
