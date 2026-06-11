// src/modules/auth/services/jwt.service.ts
//
// Issues and verifies HS256 JWTs for biometric login sessions.
// These are signed with BACKEND_JWT_SECRET (symmetric), not Supabase's
// RS256 keys.  authenticate.ts detects the 'HS256' alg header and routes
// to verifyLocalJwt() instead of verifySupabaseJwt().
//
// Payload shape is intentionally compatible with SupabaseJwtPayload so the
// authenticate middleware can use it unchanged — same 'sub' (auth_id), same
// 'email', 'role', 'aud' fields.

import { SignJWT, jwtVerify } from "jose";
import { randomUUID }         from "crypto";
import { env }                from "../../../shared/config/env";
import { AppError }           from "../../../shared/errors/AppError";
import type { SupabaseJwtPayload } from "./supabase.service";
import type { TokenPair }          from "../types";

const ACCESS_TOKEN_TTL_SECONDS  = 3600;        // 1 hour — same as Supabase
const REFRESH_TOKEN_TTL_SECONDS = 30 * 86_400; // 30 days — same as Supabase

const ISS = "hive-backend"; // distinguishes our tokens from Supabase tokens

// UUID v4 pattern — biometric refresh tokens are random UUIDs.
// Supabase refresh tokens are base64-encoded strings and never match this.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSigningKey(): Uint8Array {
  return new TextEncoder().encode(env.BACKEND_JWT_SECRET);
}

// ── Token issuance ─────────────────────────────────────────────────────────────

export interface BiometricUser {
  auth_id: string;  // Supabase auth.users.id — used as JWT 'sub'
  email:   string;
}

/** Signs an HS256 access token compatible with the authenticate middleware. */
export async function signBiometricAccessToken(user: BiometricUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub:           user.auth_id,
    email:         user.email,
    role:          "authenticated",
    aud:           "authenticated",
    iss:           ISS,
    iat:           now,
    exp:           now + ACCESS_TOKEN_TTL_SECONDS,
    app_metadata:  {},
    user_metadata: {},
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(getSigningKey());
}

/** Returns a random UUID used as an opaque refresh token for biometric sessions. */
export function generateBiometricRefreshToken(): string {
  return randomUUID();
}

/** Returns true when the token is in UUID v4 format (biometric refresh token). */
export function isBiometricRefreshToken(token: string): boolean {
  return UUID_RE.test(token);
}

/**
 * Issues a complete TokenPair for a biometric login or refresh.
 * Refresh token is a random UUID stored (hashed) in the sessions table.
 */
export async function issueBiometricTokenPair(user: BiometricUser): Promise<TokenPair> {
  const access_token  = await signBiometricAccessToken(user);
  const refresh_token = generateBiometricRefreshToken();
  const now           = Date.now();
  return {
    access_token,
    refresh_token,
    access_token_expires_at:  new Date(now + ACCESS_TOKEN_TTL_SECONDS  * 1000),
    refresh_token_expires_at: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
  };
}

// ── Token verification ──────────────────────────────────────────────────────────

/**
 * Verifies an HS256 JWT signed with BACKEND_JWT_SECRET.
 * Returns the same SupabaseJwtPayload shape used throughout the auth stack.
 */
export async function verifyLocalJwt(token: string): Promise<SupabaseJwtPayload> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      issuer:   ISS,
      audience: "authenticated",
    });
    return payload as unknown as SupabaseJwtPayload;
  } catch (err) {
    const isExpired =
      err instanceof Error &&
      (err.name === "JWTExpired" || err.message.includes('"exp" claim'));
    if (isExpired) {
      throw new AppError(401, "TOKEN_EXPIRED", "Access token has expired. Please log in again.");
    }
    throw new AppError(401, "TOKEN_INVALID", "Invalid or expired access token");
  }
}
