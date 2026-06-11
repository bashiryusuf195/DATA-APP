// src/modules/auth/services/biometric-device.service.ts
// Device-bound biometric authentication.
// device_secret is generated on the client, stored in Android Keystore,
// and NEVER stored raw on the server — only its HMAC-SHA256 hash is persisted.

import { createHmac, timingSafeEqual } from "crypto";
import type { Knex } from "knex";
import { logger }                from "../../../lib/logger";
import { env }                   from "../../../shared/config/env";
import { AppError }              from "../../../shared/errors/AppError";
import { createSession }         from "./session.service";
import { issueBiometricTokenPair } from "./jwt.service";
import type { AuthUser, TokenPair } from "../types";

// ── Hashing ───────────────────────────────────────────────────────────────────
// device_secret is 32 random bytes (256-bit entropy) so we use HMAC-SHA256
// with a server-side key rather than bcrypt (which targets low-entropy passwords).

function hashSecret(deviceSecret: string): string {
  return createHmac("sha256", env.BIOMETRIC_HMAC_SECRET)
    .update(deviceSecret)
    .digest("hex");
}

function verifySecret(deviceSecret: string, storedHash: string): boolean {
  const candidate = hashSecret(deviceSecret);
  try {
    return timingSafeEqual(
      Buffer.from(candidate, "hex"),
      Buffer.from(storedHash, "hex"),
    );
  } catch {
    return false;
  }
}

// ── Public surface ────────────────────────────────────────────────────────────

export interface RegisterBiometricDeviceInput {
  userId:       string;
  deviceId:     string;
  deviceName:   string;
  platform:     string;
  deviceSecret: string;
}

/** Register (or re-register) a biometric device for a user. */
export async function registerBiometricDevice(
  db:    Knex,
  input: RegisterBiometricDeviceInput,
): Promise<{ id: string }> {
  const secretHash = hashSecret(input.deviceSecret);

  // Upsert: allow re-registration of the same device (e.g. after app reinstall).
  const existing = await db("biometric_devices")
    .where({ user_id: input.userId, device_id: input.deviceId })
    .first<{ id: string } | undefined>(["id"]);

  if (existing) {
    await db("biometric_devices")
      .where({ id: existing.id })
      .update({ secret_hash: secretHash, device_name: input.deviceName, is_active: true, updated_at: db.fn.now() });
    logger.info("biometric_device_reregistered", { user_id: input.userId, device_id: input.deviceId });
    return { id: existing.id };
  }

  const [row] = await db("biometric_devices")
    .insert({
      user_id:     input.userId,
      device_id:   input.deviceId,
      device_name: input.deviceName,
      platform:    input.platform,
      secret_hash: secretHash,
      is_active:   true,
    })
    .returning("id");

  logger.info("biometric_device_registered", { user_id: input.userId, device_id: input.deviceId });
  return { id: row.id as string };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export interface BiometricLoginInput {
  deviceId:     string;
  deviceSecret: string;
  ipAddress?:   string | null;
  userAgent?:   string | null;
}

export interface BiometricLoginResult {
  user:       AuthUser;
  tokens:     TokenPair;
  session_id: string;
}

/** Verify device_secret and issue a fresh session. */
export async function biometricLogin(
  db:    Knex,
  input: BiometricLoginInput,
): Promise<BiometricLoginResult> {
  // 1. Look up active device registration.
  const device = await db("biometric_devices")
    .where({ device_id: input.deviceId, is_active: true })
    .first<{
      id:          string;
      user_id:     string;
      secret_hash: string;
    } | undefined>(["id", "user_id", "secret_hash"]);

  if (!device) {
    logger.warn("biometric_login_device_not_found", { device_id: input.deviceId });
    throw new AppError(401, "BIOMETRIC_DEVICE_NOT_FOUND", "Biometric device not registered or revoked");
  }

  // 2. Verify the secret — timing-safe comparison.
  if (!verifySecret(input.deviceSecret, device.secret_hash)) {
    logger.warn("biometric_login_secret_mismatch", { device_id: input.deviceId });
    throw new AppError(401, "BIOMETRIC_SECRET_INVALID", "Biometric verification failed");
  }

  // 3. Load the user.
  const user = await db("users")
    .where({ id: device.user_id })
    .whereNull("deleted_at")
    .first<AuthUser | undefined>();

  if (!user) {
    logger.warn("biometric_login_user_not_found", { user_id: device.user_id });
    throw new AppError(401, "ACCOUNT_NOT_FOUND", "User account not found");
  }
  if (user.status === "banned" || user.status === "deactivated" || user.status === "suspended") {
    throw new AppError(403, "ACCOUNT_DISABLED", "Account is not active");
  }

  // 4. Issue HS256 tokens signed with BACKEND_JWT_SECRET.
  //    No Supabase API call — fully self-contained and immune to OTP changes.
  if (!user.auth_id) {
    throw new AppError(500, "INTERNAL_ERROR", "User has no auth_id");
  }
  const tokens = await issueBiometricTokenPair({
    auth_id: user.auth_id as string,
    email:   user.email   as string,
  });

  // 5. Record session.
  const sessionId = await createSession(db, {
    userId:       user.id,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token,
    ipAddress:    input.ipAddress ?? null,
    userAgent:    input.userAgent ?? null,
    expiresAt:    tokens.refresh_token_expires_at,
  });

  // 6. Update last_used_at on the biometric device.
  await db("biometric_devices")
    .where({ id: device.id })
    .update({ last_used_at: db.fn.now(), updated_at: db.fn.now() });

  logger.info("biometric_login_success", { user_id: user.id, device_id: input.deviceId });

  return { user, tokens, session_id: sessionId };
}

// ── Device management ─────────────────────────────────────────────────────────

export interface BiometricDeviceRow {
  id:           string;
  device_id:    string;
  device_name:  string;
  platform:     string;
  last_used_at: string | null;
  created_at:   string;
}

export async function listBiometricDevices(
  db:     Knex,
  userId: string,
): Promise<BiometricDeviceRow[]> {
  return db("biometric_devices")
    .where({ user_id: userId, is_active: true })
    .orderBy("created_at", "desc")
    .select(["id", "device_id", "device_name", "platform", "last_used_at", "created_at"]);
}

export async function revokeBiometricDevice(
  db:       Knex,
  userId:   string,
  deviceId: string,
): Promise<void> {
  const updated = await db("biometric_devices")
    .where({ id: deviceId, user_id: userId })
    .update({ is_active: false, updated_at: db.fn.now() });

  if (!updated) {
    throw new AppError(404, "NOT_FOUND", "Biometric device not found");
  }
  logger.info("biometric_device_revoked", { user_id: userId, device_row_id: deviceId });
}

/** Revoke all biometric devices for a user. Called on password change/reset. */
export async function revokeAllBiometricDevices(
  db:     Knex,
  userId: string,
): Promise<void> {
  const count = await db("biometric_devices")
    .where({ user_id: userId, is_active: true })
    .update({ is_active: false, updated_at: db.fn.now() });

  if (count > 0) {
    logger.info("biometric_devices_all_revoked", { user_id: userId, count });
  }
}
