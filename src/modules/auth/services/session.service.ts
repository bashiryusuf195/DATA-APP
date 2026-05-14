// src/modules/auth/services/session.service.ts
// Manages sessions and device_registry rows.
// Sessions table is RANGE-partitioned by created_at.

import type { Knex } from "knex";
import { sha256 }    from "../../../lib/crypto";
import type { Session } from "../types";

export interface CreateSessionOpts {
  userId:            string;
  accessToken:       string;   // raw — stored as SHA-256 hash
  refreshToken?:     string;   // raw — stored as SHA-256 hash
  deviceId?:         string | null;
  ipAddress?:        string | null;
  userAgent?:        string | null;
  expiresAt:         Date;
}

// ── Session CRUD ───────────────────────────────────────────────

export async function createSession(db: Knex, opts: CreateSessionOpts): Promise<string> {
  const [row] = await db("sessions")
    .insert({
      user_id:            opts.userId,
      token_hash:         sha256(opts.accessToken),
      refresh_token_hash: opts.refreshToken ? sha256(opts.refreshToken) : null,
      device_id:          opts.deviceId   ?? null,
      ip_address:         opts.ipAddress  ?? null,
      user_agent:         opts.userAgent  ?? null,
      is_revoked:         false,
      expires_at:         opts.expiresAt,
    })
    .returning("id");
  return row.id as string;
}

export async function findSessionByToken(
  db: Knex,
  rawToken: string
): Promise<Session | undefined> {
  return db("sessions")
    .where({ token_hash: sha256(rawToken), is_revoked: false })
    .where("expires_at", ">", new Date())
    .first() as Promise<Session | undefined>;
}

export async function findSessionByRefreshToken(
  db: Knex,
  rawRefreshToken: string
): Promise<Session | undefined> {
  return db("sessions")
    .where({ refresh_token_hash: sha256(rawRefreshToken), is_revoked: false })
    .where("expires_at", ">", new Date())
    .first() as Promise<Session | undefined>;
}

export async function revokeSession(db: Knex, sessionId: string): Promise<void> {
  await db("sessions").where({ id: sessionId }).update({ is_revoked: true });
}

export async function revokeAllUserSessions(db: Knex, userId: string): Promise<void> {
  await db("sessions")
    .where({ user_id: userId, is_revoked: false })
    .update({ is_revoked: true });
}

/** Rotate: revoke old session and insert a new one atomically. */
export async function rotateSession(
  db:           Knex,
  oldSessionId: string,
  opts:         CreateSessionOpts
): Promise<string> {
  return db.transaction(async (trx) => {
    await trx("sessions").where({ id: oldSessionId }).update({ is_revoked: true });
    return createSession(trx, opts);
  });
}

// ── Device registry ────────────────────────────────────────────

export interface UpsertDeviceOpts {
  userId:             string;
  deviceFingerprint:  string;
  deviceType?:        "mobile" | "desktop" | "tablet" | "other";
  deviceName?:        string;
  userAgent?:         string | null;
  ipAddress?:         string | null;
  appVersion?:        string;
}

/** Find or create a device_registry row. Returns the device id. */
export async function upsertDevice(db: Knex, opts: UpsertDeviceOpts): Promise<string> {
  const existing = await db("device_registry")
    .where({ user_id: opts.userId, device_fingerprint: opts.deviceFingerprint })
    .first("id");

  if (existing) {
    await db("device_registry")
      .where({ id: existing.id })
      .update({
        last_seen_at: new Date(),
        ip_address:   opts.ipAddress ?? null,
        app_version:  opts.appVersion ?? null,
      });
    return existing.id as string;
  }

  const [row] = await db("device_registry")
    .insert({
      user_id:            opts.userId,
      device_fingerprint: opts.deviceFingerprint,
      device_name:        opts.deviceName ?? null,
      device_type:        opts.deviceType ?? "other",
      user_agent:         opts.userAgent  ?? null,
      ip_address:         opts.ipAddress  ?? null,
      app_version:        opts.appVersion ?? null,
      status:             "active",
      last_seen_at:       new Date(),
    })
    .returning("id");
  return row.id as string;
}
