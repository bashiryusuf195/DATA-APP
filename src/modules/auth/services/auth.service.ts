// src/modules/auth/services/auth.service.ts
// Orchestrates all auth operations. Controllers call these functions.

import type { Knex }   from "knex";
import type { Request } from "express";
import { createHash }  from "crypto";
import bcrypt          from "bcryptjs";
import { logger }      from "../../../lib/logger";
import { config }      from "../../../config";

import {
  supabaseSignIn,
  supabaseSignUp,
  supabaseDeleteUser,
  supabaseRefreshSession,
  supabaseSignOut,
  supabaseUpdatePassword,
  verifySupabaseJwt,
  getAnonClient,
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
import { createChallenge }             from "./challenge.service";
import { AppError as AuthAppError }                    from "../../../shared/errors/AppError";
import { generateReferralCode }        from "../../../lib/reference";
import { processReferralReward }       from "../../referral/services/referral-reward.service";
import { WalletService }               from "../../../services/wallet/WalletService";
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
    id:                  row.id               as string,
    auth_id:             (row.auth_id         as string | null) ?? null,
    email:               row.email            as string,
    phone:               (row.phone           as string | null) ?? null,
    username:            (row.username        as string | null) ?? null,
    status:              row.status           as AuthUser["status"],
    kyc_level:           row.kyc_level        as AuthUser["kyc_level"],
    is_email_verified:   row.is_email_verified as boolean,
    is_phone_verified:   row.is_phone_verified as boolean,
    last_login_at:       row.last_login_at ? new Date(row.last_login_at as string) : null,
    created_at:          new Date(row.created_at as string),
    has_transaction_pin: !!(row.transaction_pin_hash),
  };
}

// ── Register ───────────────────────────────────────────────────

export async function register(
  db:    Knex,
  req:   Request,
  input: RegisterInput
): Promise<{ user: AuthUser; tokens: TokenPair; sessionId: string; rbac: RbacContext }> {
  const traceId = req.traceId ?? "no-trace";

  // Step 1 — local email uniqueness check (fail fast before hitting Supabase)
  const existingLocal = await db("users").where({ email: input.email }).whereNull("deleted_at").first("id");
  if (existingLocal) {
    logger.warn("register_email_taken_local", { traceId });
    throw new AuthAppError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }

  logger.info("register_start", { traceId });

  // Step 2 — Supabase auth user creation (or recovery of an orphaned auth user)
  // An "orphaned" auth user is one where Supabase has the email but no local users row exists —
  // this happens when a previous registration crashed between step 2 and the DB transaction.
  let authId: string;
  let recoveredSession: Awaited<ReturnType<typeof supabaseSignIn>> | null = null;
  let isOrphanedRecovery = false;

  try {
    authId = await supabaseSignUp(input.email, input.password, input.phone);
    logger.info("register_step", { step: "auth_signup", status: "ok", traceId });
  } catch (signupErr) {
    if (signupErr instanceof AuthAppError && signupErr.code === "EMAIL_TAKEN") {
      // Supabase has this email but local DB doesn't — orphaned auth user from a prior crash.
      // Verify the caller's identity by signing in; on success, complete local setup.
      logger.warn("register_step", { step: "auth_signup", status: "orphan_detected", traceId });
      try {
        recoveredSession = await supabaseSignIn(input.email, input.password);
        const sessionUser = (recoveredSession as unknown as { user?: { id?: string } }).user;
        authId = sessionUser?.id ?? "";
        if (!authId) {
          throw new AuthAppError(500, "REGISTRATION_FAILED", "auth_signup: orphan recovery missing user ID");
        }
        isOrphanedRecovery = true;
        logger.info("register_step", { step: "auth_signup", status: "orphan_recovered", traceId });
      } catch (signinErr) {
        if (signinErr instanceof AuthAppError && signinErr.code === "INVALID_CREDENTIALS") {
          throw new AuthAppError(
            409,
            "EMAIL_TAKEN",
            "An account with this email already exists. Please log in or reset your password."
          );
        }
        throw signinErr;
      }
    } else {
      throw signupErr;
    }
  }

  // Step 3 — Atomic DB setup inside a Knex transaction.
  // If any step inside the transaction fails, ALL DB writes are rolled back automatically.
  // After the rollback, we delete the Supabase auth user (if it was freshly created)
  // so the email is free and the registration can be retried cleanly.
  let userRow: Record<string, unknown>;
  let referredById: string | null = null;

  try {
    await db.transaction(async (trx) => {

      // 3a. Referrer lookup (case-insensitive — user may copy code in any case)
      if (input.referral_code) {
        const referrer = await trx("users")
          .whereRaw("LOWER(referral_code) = LOWER(?)", [input.referral_code.trim()])
          .whereNull("deleted_at")
          .first("id");
        referredById = referrer?.id ?? null;
      }

      // 3b. Insert users row
      logger.info("register_step", { step: "profile_create", substep: "users_insert", traceId });
      const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
      const [u] = await trx("users")
        .insert({
          auth_id:           authId,
          email:             input.email,
          phone:             input.phone ?? null,
          password_hash:     passwordHash,
          referral_code:     generateReferralCode(),
          referred_by_id:    referredById,
          status:            "active",
          kyc_level:         "none",
          is_email_verified: true,
          is_phone_verified: false,
          metadata:          JSON.stringify({}),
        })
        .returning("*");
      userRow = u;
      logger.info("register_step", { step: "profile_create", substep: "users_insert_ok", userId: u.id as string, traceId });

      // 3c. Insert user_profiles row
      logger.info("register_step", { step: "profile_create", substep: "profiles_insert", userId: u.id as string, traceId });
      await trx("user_profiles").insert({
        user_id:      u.id,
        first_name:   input.first_name   ?? null,
        last_name:    input.last_name    ?? null,
        display_name: [input.first_name, input.last_name].filter(Boolean).join(" ") || null,
      });
      logger.info("register_step", { step: "profile_create", substep: "profiles_insert_ok", traceId });

      // 3d. Provision default NGN wallet
      logger.info("register_step", { step: "wallet_create", userId: u.id as string, traceId });
      await new WalletService(trx).createWallet({
        user_id:     u.id  as string,
        wallet_type: "user",
        currency:    "NGN",
        is_default:  true,
        label:       "Main Wallet",
      });
      logger.info("register_step", { step: "wallet_create_ok", traceId });

      // 3e. Assign 'customer' role
      logger.info("register_step", { step: "assign_role", userId: u.id as string, traceId });
      await assignRole(trx, u.id as string, "customer");
      logger.info("register_step", { step: "assign_role_ok", traceId });
    });

  } catch (txErr) {
    // Transaction fully rolled back — no partial DB state remains.
    // Delete the Supabase auth user (if freshly created) so the email is free for retry.
    const errMsg = txErr instanceof Error ? txErr.message : String(txErr);
    logger.error("register_transaction_failed", { authId, traceId, error: errMsg });

    if (!isOrphanedRecovery) {
      try {
        await supabaseDeleteUser(authId);
        logger.info("register_step", { step: "auth_cleanup", status: "ok", traceId });
      } catch (cleanupErr) {
        logger.error("register_step", {
          step:  "auth_cleanup",
          status: "failed",
          traceId,
          error: (cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)),
        });
      }
    }

    // Surface a meaningful error so the caller knows which step failed
    if (errMsg.toLowerCase().includes("user_profiles") || errMsg.toLowerCase().includes("profiles")) {
      throw new AuthAppError(500, "REGISTRATION_FAILED", "profile_create step failed — see server logs for details");
    }
    if (errMsg.toLowerCase().includes("wallet")) {
      throw new AuthAppError(500, "REGISTRATION_FAILED", "wallet_create step failed — see server logs for details");
    }
    if (errMsg.toLowerCase().includes("user_roles") || errMsg.toLowerCase().includes("role")) {
      throw new AuthAppError(500, "REGISTRATION_FAILED", "assign_role step failed — see server logs for details");
    }
    if (errMsg.toLowerCase().includes("users")) {
      throw new AuthAppError(500, "REGISTRATION_FAILED", "users_insert step failed — see server logs for details");
    }
    throw new AuthAppError(500, "REGISTRATION_FAILED", `DB setup failed (${errMsg.slice(0, 120)})`);
  }

  // Step 4 — RBAC resolution (read-only, after committed transaction)
  const userId = userRow!.id as string;
  const rbac   = await resolveUserRbac(db, userId);

  // Step 5 — Obtain Supabase session (reuse if we already signed in during recovery)
  logger.info("register_step", { step: "auth_login", traceId });
  let supabaseSession: Awaited<ReturnType<typeof supabaseSignIn>>;
  try {
    supabaseSession = recoveredSession ?? await supabaseSignIn(input.email, input.password);
  } catch (signinErr) {
    // Shouldn't happen — auth user was just created with this password.
    // Account is fully set up; user can log in manually.
    logger.error("register_step", {
      step: "auth_login", status: "failed", traceId,
      error: (signinErr instanceof Error ? signinErr.message : String(signinErr)),
    });
    throw new AuthAppError(
      500,
      "REGISTRATION_FAILED",
      "auth_login step failed — account created but sign-in failed. Please log in manually."
    );
  }
  const tokens = supabaseSessionToTokenPair(supabaseSession);
  logger.info("register_step", { step: "auth_login", status: "ok", traceId });

  // Step 6 — Device tracking
  let deviceId: string | null = null;
  const fingerprint = input.device_fingerprint ?? req.deviceFingerprint;
  if (fingerprint) {
    deviceId = await upsertDevice(db, {
      userId:            userId,
      deviceFingerprint: fingerprint,
      deviceName:        input.device_name,
      userAgent:         req.headers["user-agent"] ?? null,
      ipAddress:         extractIp(req),
    });
  }

  // Step 7 — Create session record
  logger.info("register_step", { step: "session_create", traceId });
  let sessionId: string;
  try {
    sessionId = await createSession(db, {
      userId:       userId,
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      deviceId,
      ipAddress:    extractIp(req),
      userAgent:    req.headers["user-agent"] ?? null,
      expiresAt:    tokens.refresh_token_expires_at,
    });
  } catch (sessionErr) {
    logger.error("register_step", {
      step: "session_create", status: "failed", traceId,
      error: (sessionErr instanceof Error ? sessionErr.message : String(sessionErr)),
    });
    throw new AuthAppError(500, "REGISTRATION_FAILED", "session_create step failed — see server logs");
  }
  logger.info("register_step", { step: "session_create", status: "ok", traceId });

  // Audit log (fire-and-forget)
  writeAuditLog(db, req, {
    actorId:      userId,
    action:       "register",
    outcome:      "success",
    resourceType: "user",
    resourceId:   userId,
  });

  // Referral reward (fire-and-forget — never blocks registration)
  if (referredById) {
    processReferralReward("signup", userId).catch((err) =>
      logger.warn("referral_signup_failed", { user_id: userId, error: (err as Error).message })
    );
  }

  logger.info("register_complete", { userId, traceId });
  return { user: coerceUser(userRow!), tokens, sessionId, rbac };
}

// ── Login ──────────────────────────────────────────────────────

export async function login(
  db:    Knex,
  req:   Request,
  input: LoginInput
): Promise<
  | { requires_2fa: true;  challenge_id: string }
  | { requires_2fa: false; user: AuthUser; tokens: TokenPair; sessionId: string; rbac: RbacContext }
> {
  const traceId = req.traceId ?? "no-trace";

  // 1. Load user
  const user = await db("users")
    .where({ email: input.email })
    .whereNull("deleted_at")
    .first();

  logger.info("login_attempt", {
    email:            input.email,
    password_present: !!input.password,
    user_found:       !!user,
    user_status:      user?.status ?? null,
    locked_until:     user?.locked_until ?? null,
    traceId,
  });

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
  logger.info("login_supabase_signin", { userId: user.id as string, traceId });
  let supabaseSession: Awaited<ReturnType<typeof supabaseSignIn>>;
  try {
    supabaseSession = await supabaseSignIn(input.email, input.password);
    logger.info("login_supabase_signin_ok", { userId: user.id as string, traceId });
  } catch (signinErr) {
    // Increment failed attempts
    const attempts = ((user.failed_login_attempts as number) ?? 0) + 1;
    const update: Record<string, unknown> = { failed_login_attempts: attempts };
    if (attempts >= env.MAX_FAILED_LOGINS) {
      update.locked_until = new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000);
    }
    await db("users").where({ id: user.id }).update(update);

    logger.warn("login_supabase_signin_failed", {
      userId: user.id as string,
      attempts,
      traceId,
      error: (signinErr instanceof Error ? signinErr.message : String(signinErr)),
    });

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

  // 5. Clear brute-force on successful password verification
  await db("users").where({ id: user.id }).update({
    failed_login_attempts: 0,
    locked_until:          null,
  });

  // 5a. Resolve RBAC (needed both for 2FA check and for the normal login return)
  const rbac = await resolveUserRbac(db, user.id as string);

  // 5b. 2FA enforcement — admin/super_admin users with TOTP enabled must complete
  //     a second factor before a session is created.
  const isAdminUser = rbac.roles.some((r) => r === "admin" || r === "super_admin");
  if (isAdminUser && user.totp_enabled) {
    const challengeId = await createChallenge(
      user.id         as string,
      user.email      as string,
      supabaseSession.access_token,
      supabaseSession.refresh_token,
      // expires_at is a Unix timestamp (seconds); fall back to expires_in if absent.
      supabaseSession.expires_at ??
        Math.floor(Date.now() / 1000) + (supabaseSession.expires_in ?? 3600),
    );

    writeAuditLog(db, req, {
      actorId:      user.id as string,
      action:       "2fa_challenge",
      outcome:      "success",
      resourceType: "session",
    });

    return { requires_2fa: true as const, challenge_id: challengeId };
  }

  // Normal login — complete the session now (no 2FA required or non-admin user).
  await db("users").where({ id: user.id }).update({
    last_login_at: new Date(),
    login_count:   db.raw("login_count + 1"),
  });

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

  return { requires_2fa: false as const, user: coerceUser(user), tokens, sessionId, rbac };
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
      db.raw("u.transaction_pin_hash IS NOT NULL AS has_transaction_pin"),
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
    roles:               rbac.roles,
    permissions:         rbac.permissions,
    has_transaction_pin: (row.has_transaction_pin as boolean) ?? false,
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

// ── Forgot password ────────────────────────────────────────────
// Fire-and-forget design: we never surface Supabase's response to
// the caller. Whether the email exists or not, the HTTP response is
// identical — preventing user enumeration.

export async function forgotPassword(email: string): Promise<void> {
  const redirectTo = `${env.CUSTOMER_APP_URL}/reset-password`;

  const { error } = await getAnonClient().auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    logger.warn("forgot_password_provider_error", {
      code:   error.code   ?? null,
      status: (error as unknown as { status?: number }).status ?? null,
      name:   error.name   ?? null,
    });
  } else {
    logger.info("forgot_password_provider_accepted");
  }
}

// ── Reset password ─────────────────────────────────────────────
// Verifies the short-lived access token issued by Supabase's recovery
// email link, then updates the password via the Admin API.
// access_token and password are NEVER logged.

export async function resetPassword(
  accessToken:  string,
  newPassword:  string,
): Promise<void> {
  // Throws AppError 401 if the token is expired or invalid.
  const payload = await verifySupabaseJwt(accessToken);
  await supabaseUpdatePassword(payload.sub, newPassword);
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
