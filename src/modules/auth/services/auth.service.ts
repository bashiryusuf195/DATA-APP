// src/modules/auth/services/auth.service.ts
// Orchestrates all auth operations. Controllers call these functions.

import type { Knex }   from "knex";
import type { Request } from "express";
import { createHash }  from "crypto";
import bcrypt          from "bcryptjs";

import {
  supabaseSignIn,
  supabaseSignUp,
  supabaseRefreshSession,
  supabaseSignOut,
  supabaseUpdatePassword,
} from "./supabase.service";
import {
  createSession,
  findSessionByRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  rotateSession,
  upsertDevice,
} from "./session.service";
import { resolveUserRbac, assignRole } from "./rbac.service";
import { writeAuditLog }               from "./audit.service";
import { AppError as AuthAppError }                    from "../../../shared/errors/AppError";
import { env }                         from "../../../shared/config/env";
import type {
  AuthUser,
  AuthUserWithProfile,
  TokenPair,
  AccessTokenPayload,
  RbacContext,
} from "../types";
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
} from "../validators/auth.validators";

// ── Constants ──────────────────────────────────────────────────

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days

// ── Helpers ────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function extractIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"] as string | undefined;
  return fwd?.split(",")[0].trim() || req.socket?.remoteAddress || null;
}

function supabaseSessionToTokenPair(session: {
  access_token:  string;
  refresh_token: string;
  expires_in?:   number;
}): TokenPair {
  const expiresIn = session.expires_in ?? 3600;
  return {
    access_token:             session.access_token,
    refresh_token:            session.refresh_token,
    access_token_expires_at:  new Date(Date.now() + expiresIn * 1000),
    refresh_token_expires_at: new Date(Date.now() + REFRESH_TTL_MS),
  };
}

function coerceUser(row: Record<string, unknown>): AuthUser {
  return {
    id:                row.id               as string,
    auth_id:           (row.auth_id         as string | null) ?? null,
    email:             row.email            as string,
    phone:             (row.phone           as string | null) ?? null,
    username:          (row.username        as string | null) ?? null,
    status:            row.status           as AuthUser["status"],
    kyc_level:         row.kyc_level        as AuthUser["kyc_level"],
    is_email_verified: row.is_email_verified as boolean,
    is_phone_verified: row.is_phone_verified as boolean,
    last_login_at:     row.last_login_at ? new Date(row.last_login_at as string) : null,
    created_at:        new Date(row.created_at as string),
  };
}

// ── Register ───────────────────────────────────────────────────

export async function register(
  db:    Knex,
  req:   Request,
  input: RegisterInput
): Promise<{ user: AuthUser; tokens: TokenPair; sessionId: string; rbac: RbacContext }> {
  // 1. Email uniqueness — fail fast before hitting Supabase
  const existing = await db("users").where({ email: input.email }).first("id");
  if (existing) {
    throw new AuthAppError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }

  // 2. Create Supabase auth user
  const authId = await supabaseSignUp(input.email, input.password, input.phone);

  // 3. Create local users row
  const [user] = await db("users")
    .insert({
      auth_id:           authId,
      email:             input.email,
      phone:             input.phone ?? null,
      password_hash:     await bcrypt.hash(input.password, env.BCRYPT_ROUNDS),
      status:            "active",
      kyc_level:         "none",
      is_email_verified: true,
      is_phone_verified: false,
      metadata:          JSON.stringify({}),
    })
    .returning("*");

  // 4. Create profile skeleton
  await db("user_profiles").insert({
    user_id:      user.id,
    first_name:   input.first_name ?? null,
    last_name:    input.last_name  ?? null,
    display_name: [input.first_name, input.last_name].filter(Boolean).join(" ") || null,
  });

  // 5. Assign default 'user' role
  await assignRole(db, user.id as string, "user");

  // 6. Resolve RBAC context
  const rbac = await resolveUserRbac(db, user.id as string);

  // 7. Obtain Supabase tokens
  const supabaseSession = await supabaseSignIn(input.email, input.password);
  const tokens           = supabaseSessionToTokenPair(supabaseSession);

  // 8. Device tracking
  let deviceId: string | null = null;
  const fingerprint = input.device_fingerprint ?? req.deviceFingerprint;
  if (fingerprint) {
    deviceId = await upsertDevice(db, {
      userId:            user.id as string,
      deviceFingerprint: fingerprint,
      deviceName:        input.device_name,
      userAgent:         req.headers["user-agent"] ?? null,
      ipAddress:         extractIp(req),
    });
  }

  // 9. Create session record
  const sessionId = await createSession(db, {
    userId:       user.id as string,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    deviceId,
    ipAddress:    extractIp(req),
    userAgent:    req.headers["user-agent"] ?? null,
    expiresAt:    tokens.refresh_token_expires_at,
  });

  // 10. Audit log (fire-and-forget)
  writeAuditLog(db, req, {
    actorId:      user.id as string,
    action:       "register",
    outcome:      "success",
    resourceType: "user",
    resourceId:   user.id as string,
  });

  return { user: coerceUser(user), tokens, sessionId, rbac };
}

// ── Login ──────────────────────────────────────────────────────

export async function login(
  db:    Knex,
  req:   Request,
  input: LoginInput
): Promise<{ user: AuthUser; tokens: TokenPair; sessionId: string; rbac: RbacContext }> {
  // 1. Load user
  const user = await db("users")
    .where({ email: input.email })
    .whereNull("deleted_at")
    .first();

  if (!user) {
    // Avoid email enumeration
    throw new AuthAppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  // 2. Account status
  if (user.status === "banned" || user.status === "deactivated") {
    throw new AuthAppError(403, "ACCOUNT_DISABLED", "Your account has been disabled");
  }

  // 3. Brute-force lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil(
      (new Date(user.locked_until).getTime() - Date.now()) / 60_000
    );
    throw new AuthAppError(
      423,
      "ACCOUNT_LOCKED",
      `Too many failed attempts. Try again in ${remaining} minute(s).`
    );
  }

  // 4. Authenticate via Supabase
  let supabaseSession: Awaited<ReturnType<typeof supabaseSignIn>>;
  try {
    supabaseSession = await supabaseSignIn(input.email, input.password);
  } catch {
    // Increment failed attempts
    const attempts = ((user.failed_login_attempts as number) ?? 0) + 1;
    const update: Record<string, unknown> = { failed_login_attempts: attempts };
    if (attempts >= env.MAX_FAILED_LOGINS) {
      update.locked_until = new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000);
    }
    await db("users").where({ id: user.id }).update(update);

    writeAuditLog(db, req, {
      actorId:  user.id as string,
      action:   "login_failed",
      outcome:  "failure",
      resourceType: "session",
      errorMessage: `Failed attempt ${attempts}/${env.MAX_FAILED_LOGINS}`,
    });

    throw new AuthAppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const tokens = supabaseSessionToTokenPair(supabaseSession);

  // 5. Clear brute-force counter
  await db("users").where({ id: user.id }).update({
    failed_login_attempts: 0,
    locked_until:          null,
    last_login_at:         new Date(),
    login_count:           db.raw("login_count + 1"),
  });

  // 6. RBAC
  const rbac = await resolveUserRbac(db, user.id as string);

  // 7. Device
  let deviceId: string | null = null;
  const fingerprint = input.device_fingerprint ?? req.deviceFingerprint;
  if (fingerprint) {
    deviceId = await upsertDevice(db, {
      userId:            user.id as string,
      deviceFingerprint: fingerprint,
      deviceName:        input.device_name,
      userAgent:         req.headers["user-agent"] ?? null,
      ipAddress:         extractIp(req),
    });
  }

  // 8. Session
  const sessionId = await createSession(db, {
    userId:       user.id as string,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    deviceId,
    ipAddress:    extractIp(req),
    userAgent:    req.headers["user-agent"] ?? null,
    expiresAt:    tokens.refresh_token_expires_at,
  });

  writeAuditLog(db, req, {
    actorId:      user.id as string,
    action:       "login",
    outcome:      "success",
    resourceType: "session",
    resourceId:   sessionId,
  });

  return { user: coerceUser(user), tokens, sessionId, rbac };
}

// ── Logout ─────────────────────────────────────────────────────

export async function logout(
  db:          Knex,
  req:         Request,
  userId:      string,
  sessionId:   string | undefined,
  allDevices:  boolean,
  accessToken: string
): Promise<void> {
  if (allDevices) {
    await revokeAllUserSessions(db, userId);
  } else if (sessionId) {
    await revokeSession(db, sessionId);
  }

  // Best-effort Supabase invalidation
  supabaseSignOut(accessToken).catch(() => undefined);

  writeAuditLog(db, req, {
    actorId:      userId,
    action:       "logout",
    outcome:      "success",
    resourceType: "session",
    metadata:     { all_devices: allDevices },
  });
}

// ── Refresh ────────────────────────────────────────────────────

export async function refreshTokens(
  db:             Knex,
  req:            Request,
  rawRefreshToken: string
): Promise<{ tokens: TokenPair; sessionId: string }> {
  const session = await findSessionByRefreshToken(db, rawRefreshToken);
  if (!session) {
    throw new AuthAppError(401, "REFRESH_TOKEN_INVALID", "Invalid or expired refresh token");
  }

  // Supabase refresh
  const newSupabaseSession = await supabaseRefreshSession(rawRefreshToken);
  const tokens              = supabaseSessionToTokenPair(newSupabaseSession);

  // Rotate: revoke old session, insert new
  const sessionId = await rotateSession(db, session.id, {
    userId:       session.user_id,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    deviceId:     session.device_id,
    ipAddress:    extractIp(req),
    userAgent:    req.headers["user-agent"] ?? null,
    expiresAt:    tokens.refresh_token_expires_at,
  });

  writeAuditLog(db, req, {
    actorId:      session.user_id,
    action:       "token_refresh",
    outcome:      "success",
    resourceType: "session",
    resourceId:   sessionId,
  });

  return { tokens, sessionId };
}

// ── Get current user ───────────────────────────────────────────

export async function getMe(db: Knex, userId: string): Promise<AuthUserWithProfile> {
  const row = await db("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .where("u.id", userId)
    .first([
      "u.id", "u.auth_id", "u.email", "u.phone", "u.username",
      "u.status", "u.kyc_level",
      "u.is_email_verified", "u.is_phone_verified",
      "u.last_login_at", "u.login_count", "u.created_at",
      "p.first_name", "p.last_name", "p.display_name",
      "p.avatar_url", "p.country", "p.city",
    ]);

  if (!row) throw new AuthAppError(404, "NOT_FOUND", "User not found");

  const rbac = await resolveUserRbac(db, userId);

  return {
    id:                row.id               as string,
    auth_id:           (row.auth_id         as string | null) ?? null,
    email:             row.email            as string,
    phone:             (row.phone           as string | null) ?? null,
    username:          (row.username        as string | null) ?? null,
    status:            row.status           as AuthUser["status"],
    kyc_level:         row.kyc_level        as AuthUser["kyc_level"],
    is_email_verified: row.is_email_verified as boolean,
    is_phone_verified: row.is_phone_verified as boolean,
    last_login_at:     row.last_login_at ? new Date(row.last_login_at as string) : null,
    created_at:        new Date(row.created_at as string),
    profile: {
      id:           userId,
      user_id:      userId,
      first_name:   (row.first_name   as string | null) ?? null,
      last_name:    (row.last_name    as string | null) ?? null,
      display_name: (row.display_name as string | null) ?? null,
      avatar_url:   (row.avatar_url   as string | null) ?? null,
      country:      (row.country      as string | null) ?? null,
      city:         (row.city         as string | null) ?? null,
    },
    roles:       rbac.roles,
    permissions: rbac.permissions,
  };
}

// ── Change password ────────────────────────────────────────────

export async function changePassword(
  db:     Knex,
  req:    Request,
  userId: string,
  input:  ChangePasswordInput
): Promise<void> {
  const user = await db("users").where({ id: userId }).first();
  if (!user) throw new AuthAppError(404, "NOT_FOUND", "User not found");

  // Verify current password via Supabase sign-in
  try {
    await supabaseSignIn(user.email as string, input.current_password);
  } catch {
    writeAuditLog(db, req, {
      actorId:      userId,
      action:       "password_change",
      outcome:      "failure",
      resourceType: "user",
      resourceId:   userId,
      errorMessage: "Wrong current password",
    });
    throw new AuthAppError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
  }

  // Update in Supabase
  if (user.auth_id) {
    await supabaseUpdatePassword(user.auth_id as string, input.new_password);
  }

  // Update local bcrypt hash
  await db("users").where({ id: userId }).update({
    password_hash: await bcrypt.hash(input.new_password, env.BCRYPT_ROUNDS),
  });

  // Revoke all sessions — force re-login
  await revokeAllUserSessions(db, userId);

  writeAuditLog(db, req, {
    actorId:      userId,
    action:       "password_change",
    outcome:      "success",
    resourceType: "user",
    resourceId:   userId,
  });
}

// ── Verify access token (used by authenticate middleware) ──────

export async function verifyAccessToken(
  db:       Knex,
  rawToken: string
): Promise<AccessTokenPayload> {
  const { verifySupabaseJwt } = await import("./supabase.service");
  const jwtPayload = await verifySupabaseJwt(rawToken);

  const user = await db("users")
    .where({ auth_id: jwtPayload.sub })
    .whereNull("deleted_at")
    .first(["id", "auth_id", "email", "status"]);

  if (!user) {
    throw new AuthAppError(401, "ACCOUNT_NOT_FOUND", "User account not found");
  }
  if (user.status === "banned" || user.status === "deactivated") {
    throw new AuthAppError(403, "ACCOUNT_DISABLED", "Account is not active");
  }

  const rbac = await resolveUserRbac(db, user.id as string);

  return {
    sub:         user.id      as string,
    id:          user.id      as string,
    auth_id:     user.auth_id as string,
    email:       user.email   as string,
    status:      user.status  as string,
    roles:       rbac.roles,
    permissions: rbac.permissions,
    session:     "",   // filled in by authenticate middleware from DB lookup
  };
}
