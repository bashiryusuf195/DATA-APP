// src/modules/auth/services/passkey.service.ts
//
// WebAuthn / Passkey authentication service.
// Handles credential registration, authentication, and device management.
//
// Token issuance for passkey login:
//   admin.generateLink({ type: 'magiclink', email }) — generates OTP without sending email.
//   anonClient.auth.verifyOtp({ token_hash })        — exchanges OTP for a Supabase session.
// This issues the same Supabase-signed tokens as email/password login.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  WebAuthnCredential,
} from "@simplewebauthn/server";

import { randomUUID } from "crypto";
import type { Knex }  from "knex";
import { getDbInstance }              from "../../../db/knex";
import { redis }                      from "../../../config/redis";
import { config }                     from "../../../config";
import { logger }                     from "../../../lib/logger";
import { AppError }                   from "../../../shared/errors/AppError";
import { getAnonClient, getAdminClient } from "./supabase.service";
import { createSession }              from "./session.service";
import { resolveUserRbac }            from "./rbac.service";

const db                     = getDbInstance();
const CHALLENGE_TTL_SECONDS  = 120;   // 2-minute window; expired challenges are rejected

// ── Redis challenge store ─────────────────────────────────────────────────────
// Challenges are single-use: getdel consumes and deletes atomically.

async function storeChallenge(key: string, challenge: string): Promise<void> {
  await redis.setex(`webauthn:${key}`, CHALLENGE_TTL_SECONDS, challenge);
}

async function consumeChallenge(key: string): Promise<string | null> {
  return redis.getdel(`webauthn:${key}`);
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

function toBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64url(str: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(str, "base64url");
  // Buffer is a Uint8Array<ArrayBuffer> — slice() returns a plain Uint8Array<ArrayBuffer>
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer as unknown as Uint8Array<ArrayBuffer>;
}

// ── Registration — begin ──────────────────────────────────────────────────────

export async function beginRegistration(
  userId:          string,
  userEmail:       string,
  userDisplayName: string,
) {
  // Fetch existing credentials so the same device can't be registered twice.
  const existing = await db("user_passkeys")
    .where({ user_id: userId })
    .select("credential_id", "transports");

  const options = await generateRegistrationOptions({
    rpName:          config.webauthn.rpName,
    rpID:            config.webauthn.rpId,
    userName:        userEmail,
    userID:          Buffer.from(userId),
    userDisplayName,
    authenticatorSelection: {
      residentKey:             "required",   // makes credential discoverable (no email needed at login)
      userVerification:        "required",   // requires biometric/PIN — not just presence
      authenticatorAttachment: "platform",   // device-bound: Touch ID, Face ID, Windows Hello
    },
    excludeCredentials: existing.map((c) => ({
      id:         c.credential_id as string,
      transports: (c.transports as AuthenticatorTransportFuture[] | null) ?? [],
    })),
    attestationType: "none",
    timeout:         60_000,
  });

  await storeChallenge(`reg:${userId}`, options.challenge);
  return options;
}

// ── Registration — complete ───────────────────────────────────────────────────

export async function completeRegistration(
  userId:        string,
  credential:    RegistrationResponseJSON,
  friendlyName?: string,
): Promise<void> {
  const challenge = await consumeChallenge(`reg:${userId}`);
  if (!challenge) {
    throw new AppError(400, "PASSKEY_CHALLENGE_EXPIRED",
      "Registration challenge expired or already used. Please try again.");
  }

  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response:            credential,
    expectedChallenge:   challenge,
    expectedOrigin:      config.webauthn.origin,
    expectedRPID:        config.webauthn.rpId,
    requireUserVerification: true,
  });

  if (!verified || !registrationInfo) {
    throw new AppError(400, "PASSKEY_VERIFICATION_FAILED",
      "Passkey registration could not be verified. Please try again.");
  }

  const { credential: cred, credentialDeviceType, credentialBackedUp } = registrationInfo;
  const now = new Date();

  await db("user_passkeys")
    .insert({
      user_id:               userId,
      credential_id:         cred.id,
      credential_public_key: toBase64url(cred.publicKey),
      counter:               cred.counter,
      device_type:           credentialDeviceType,
      backed_up:             credentialBackedUp,
      transports:            cred.transports ?? null,
      friendly_name:         friendlyName ?? null,
      created_at:            now,
      updated_at:            now,
    })
    .onConflict("credential_id")
    .merge({ updated_at: now }); // re-registration of same device updates the record

  logger.info("passkey_registered", {
    user_id:     userId,
    credential_id: cred.id,
    device_type: credentialDeviceType,
    backed_up:   credentialBackedUp,
  });
}

// ── Authentication — begin ────────────────────────────────────────────────────

export async function beginAuthentication(): Promise<{
  options:             object;
  passkeySessionToken: string;
}> {
  const options = await generateAuthenticationOptions({
    rpID: config.webauthn.rpId,
    // Discoverable credentials: empty allowCredentials lets the authenticator
    // pick the right key for this rpID — no email/username needed from the user.
    allowCredentials: [],
    userVerification: "required",
    timeout:          60_000,
  });

  // A random token links this challenge to the completion request.
  // It's sent to the client and returned unchanged with the assertion.
  const passkeySessionToken = randomUUID();
  await storeChallenge(`auth:${passkeySessionToken}`, options.challenge);

  return { options, passkeySessionToken };
}

// ── Authentication — complete ─────────────────────────────────────────────────

export async function completeAuthentication(params: {
  passkeySessionToken: string;
  assertion:           AuthenticationResponseJSON;
  db:                  Knex;
  ipAddress?:          string | null;
  userAgent?:          string | null;
}) {
  const { passkeySessionToken, assertion, db: dbInstance, ipAddress, userAgent } = params;

  // ── Step 1: Consume challenge (single-use) ───────────────────────────────────
  const challenge = await consumeChallenge(`auth:${passkeySessionToken}`);
  if (!challenge) {
    throw new AppError(400, "PASSKEY_CHALLENGE_EXPIRED",
      "Authentication challenge expired or already used. Please try again.");
  }

  // ── Step 2: Look up credential ───────────────────────────────────────────────
  const passkeyRow = await dbInstance("user_passkeys")
    .where({ credential_id: assertion.id })
    .first();

  if (!passkeyRow) {
    throw new AppError(401, "PASSKEY_NOT_FOUND",
      "No passkey found for this device. Please sign in with email and password.");
  }

  // ── Step 3: Rebuild WebAuthnCredential from DB row ───────────────────────────
  const webAuthnCredential: WebAuthnCredential = {
    id:         passkeyRow.credential_id  as string,
    publicKey:  fromBase64url(passkeyRow.credential_public_key as string),
    counter:    Number(passkeyRow.counter),
    transports: (passkeyRow.transports as AuthenticatorTransportFuture[] | null) ?? undefined,
  };

  // ── Step 4: Verify the assertion signature ───────────────────────────────────
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response:            assertion,
    expectedChallenge:   challenge,
    expectedOrigin:      config.webauthn.origin,
    expectedRPID:        config.webauthn.rpId,
    credential:          webAuthnCredential,
    requireUserVerification: true,
  });

  if (!verified) {
    throw new AppError(401, "PASSKEY_VERIFICATION_FAILED",
      "Biometric authentication failed. Please try again or use email and password.");
  }

  // ── Step 5: Update counter + last_used_at ────────────────────────────────────
  await dbInstance("user_passkeys")
    .where({ credential_id: assertion.id })
    .update({
      counter:      authenticationInfo.newCounter,
      last_used_at: new Date(),
      device_type:  authenticationInfo.credentialDeviceType,
      backed_up:    authenticationInfo.credentialBackedUp,
    });

  // ── Step 6: Load and validate user ──────────────────────────────────────────
  const user = await dbInstance("users")
    .where({ id: passkeyRow.user_id as string })
    .first();

  if (!user) {
    throw new AppError(401, "USER_NOT_FOUND", "Account not found.");
  }
  if (user.status === "banned" || user.status === "deactivated") {
    throw new AppError(401, "ACCOUNT_INACTIVE", "This account is no longer active.");
  }

  // ── Step 7: Issue Supabase tokens ────────────────────────────────────────────
  // Uses generateLink (no email sent) + verifyOtp to obtain a real Supabase session.
  const supabaseSession = await issueSupabaseSession(user.email as string);

  const expiresIn    = supabaseSession.expires_in ?? 3600;
  const accessExpiry = new Date(Date.now() + expiresIn * 1000);

  // ── Step 8: Create local session record ──────────────────────────────────────
  const sessionId = await createSession(dbInstance, {
    userId:       user.id       as string,
    accessToken:  supabaseSession.access_token,
    refreshToken: supabaseSession.refresh_token ?? undefined,
    ipAddress:    ipAddress ?? null,
    userAgent:    userAgent ?? null,
    expiresAt:    accessExpiry,
  });

  // ── Step 9: Load RBAC ────────────────────────────────────────────────────────
  const rbac = await resolveUserRbac(dbInstance, user.id as string);

  logger.info("passkey_authenticated", {
    user_id:       user.id       as string,
    credential_id: assertion.id,
  });

  return {
    user,
    tokens: {
      access_token:             supabaseSession.access_token,
      refresh_token:            supabaseSession.refresh_token,
      access_token_expires_at:  accessExpiry,
      refresh_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    sessionId,
    rbac,
  };
}

// ── Token issuance via Supabase magic-link OTP ────────────────────────────────
// Calls admin.generateLink to create a magic-link token without sending email,
// then immediately verifies it to obtain a real Supabase session with tokens.

async function issueSupabaseSession(email: string) {
  const { data: linkData, error: linkError } =
    await getAdminClient().auth.admin.generateLink({
      type:  "magiclink",
      email,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    logger.error("passkey_generate_link_failed", {
      code:   linkError?.code   ?? null,
      status: (linkError as { status?: number })?.status ?? null,
    });
    throw new AppError(500, "TOKEN_ISSUANCE_FAILED",
      "Unable to issue session. Please try again.");
  }

  const { data: sessionData, error: sessionError } =
    await getAnonClient().auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type:       "magiclink",
    });

  if (sessionError || !sessionData?.session) {
    logger.error("passkey_verify_otp_failed", {
      code:   sessionError?.code   ?? null,
      status: (sessionError as { status?: number })?.status ?? null,
    });
    throw new AppError(500, "TOKEN_ISSUANCE_FAILED",
      "Unable to establish session. Please try again.");
  }

  return sessionData.session;
}

// ── Passkey device management ─────────────────────────────────────────────────

export interface PasskeyRecord {
  id:            string;
  friendly_name: string | null;
  device_type:   string | null;
  backed_up:     boolean;
  transports:    string[] | null;
  last_used_at:  Date   | null;
  created_at:    Date;
}

export async function listPasskeys(userId: string): Promise<PasskeyRecord[]> {
  return db("user_passkeys")
    .where({ user_id: userId })
    .orderBy("created_at", "desc")
    .select(
      "id", "friendly_name", "device_type", "backed_up",
      "transports", "last_used_at", "created_at",
    );
}

export async function deletePasskey(userId: string, passkeyId: string): Promise<void> {
  const count = await db("user_passkeys")
    .where({ id: passkeyId, user_id: userId }) // user_id check prevents IDOR
    .delete();

  if (!count) {
    throw new AppError(404, "PASSKEY_NOT_FOUND", "Passkey not found.");
  }

  logger.info("passkey_revoked", { user_id: userId, passkey_id: passkeyId });
}
