// src/modules/auth/services/supabase.service.ts
// Thin wrapper around @supabase/supabase-js.
//
// Two clients:
//   anonClient  — ANON key, used for user-facing sign-in flows
//   adminClient — SERVICE_ROLE key, bypasses RLS, for server ops
//
// JWT verification is done locally with SUPABASE_JWT_SECRET to
// avoid a network round-trip on every authenticated request.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { env }                                from "../../../shared/config/env";
import { AppError }                           from "../../../shared/errors/AppError";
const JWKS = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

// ── Singleton clients ──────────────────────────────────────────

let _anonClient:  SupabaseClient | undefined;
let _adminClient: SupabaseClient | undefined;

export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _anonClient;
}

export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}

// ── JWT payload shape ──────────────────────────────────────────

export interface SupabaseJwtPayload {
  sub:           string;   // auth.users.id (UUID)
  email:         string;
  role:          string;   // 'authenticated' | 'anon'
  aud:           string;
  iat:           number;
  exp:           number;
  app_metadata:  Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}

/**
 * Verify a Supabase JWT locally.
 * Avoids a network round-trip on every request.
 */
export async function verifySupabaseJwt(
  token: string
): Promise<SupabaseJwtPayload> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });

    return payload as unknown as SupabaseJwtPayload;
  } catch (err: unknown) {
    // Distinguish expired tokens from genuinely invalid ones for cleaner logging.
    const isExpired =
      err instanceof Error &&
      (err.name === 'JWTExpired' || err.message.includes('"exp" claim'))

    if (isExpired) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired. Please log in again.')
    }

    throw new AppError(401, 'TOKEN_INVALID', 'Invalid or expired access token')
  }
}


/**
 * Sign in a user via Supabase email/password.
 * Returns the raw Supabase session containing access + refresh tokens.
 */
export async function supabaseSignIn(email: string, password: string) {
  const { data, error } = await getAnonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new AppError(401, "INVALID_CREDENTIALS", error?.message ?? "Invalid credentials");
  }
  return data.session;
}

/**
 * Create a Supabase auth user via the Admin API.
 * Returns the new user's auth_id (UUID).
 */
export async function supabaseSignUp(email: string, password: string, phone?: string): Promise<string> {
  const { data, error } = await getAdminClient().auth.admin.createUser({
    email,
    password,
    phone:         phone ?? undefined,
    email_confirm: true,  // auto-confirm; set false to require email verification
  });
  if (error || !data.user) {
    if (error?.message?.includes("already registered")) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw new AppError(500, "INTERNAL_ERROR", error?.message ?? "Failed to create auth user");
  }
  return data.user.id;
}

/**
 * Refresh a Supabase session using a raw refresh token.
 */
export async function supabaseRefreshSession(refreshToken: string) {
  const { data, error } = await getAnonClient().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) {
    throw new AppError(401, "REFRESH_TOKEN_INVALID", error?.message ?? "Invalid refresh token");
  }
  return data.session;
}

/**
 * Invalidate a Supabase session by calling signOut.
 * Best-effort — never throws; our local session is already revoked.
 */
export async function supabaseSignOut(accessToken: string): Promise<void> {
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    await client.auth.signOut();
  } catch {
    // best-effort
  }
}

/**
 * Update a user's password via the Supabase Admin API.
 */
export async function supabaseUpdatePassword(authId: string, newPassword: string): Promise<void> {
  const { error } = await getAdminClient().auth.admin.updateUserById(authId, {
    password: newPassword,
  });
  if (error) throw new AppError(500, "INTERNAL_ERROR", error.message);
}
