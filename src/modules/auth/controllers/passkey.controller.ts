// src/modules/auth/controllers/passkey.controller.ts
// HTTP adapters for WebAuthn / Passkey endpoints.
// All business logic lives in passkey.service.ts.

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDbInstance } from "../../../db/knex";
import {
  beginRegistration,
  completeRegistration,
  beginAuthentication,
  completeAuthentication,
  listPasskeys,
  deletePasskey,
} from "../services/passkey.service";

// ── POST /auth/passkey/register/begin ─────────────────────────────────────────
// Returns PublicKeyCredentialCreationOptions for navigator.credentials.create().
// Requires an existing authenticated session (passkeys are bound to real accounts).

export async function beginRegistrationController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const user   = req.user!;
    const db     = getDbInstance();
    const profile = await db("users as u")
      .leftJoin("user_profiles as p", "p.user_id", "u.id")
      .where("u.id", user.id)
      .select("u.email", "p.first_name", "p.last_name")
      .first();

    const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
      || (profile?.email as string | undefined)
      || "User";

    const options = await beginRegistration(user.id, user.email, displayName);
    res.status(200).json({ success: true, data: options });
  } catch (err) {
    next(err);
  }
}

// ── POST /auth/passkey/register/complete ──────────────────────────────────────
// Verifies the credential and stores it in user_passkeys.

const CompleteRegistrationSchema = z.object({
  credential:   z.record(z.unknown()),              // RegistrationResponseJSON — opaque JSON
  friendlyName: z.string().max(100).optional(),     // user-supplied device label
});

export async function completeRegistrationController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const parsed = CompleteRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid registration payload" });
      return;
    }

    await completeRegistration(
      req.user!.id,
      parsed.data.credential as never,
      parsed.data.friendlyName,
    );

    res.status(200).json({ success: true, message: "Passkey registered successfully." });
  } catch (err) {
    next(err);
  }
}

// ── POST /auth/passkey/auth/begin ─────────────────────────────────────────────
// Public endpoint — no session. Returns authentication options + passkeySessionToken.

export async function beginAuthenticationController(
  _req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { options, passkeySessionToken } = await beginAuthentication();
    res.status(200).json({ success: true, data: { options, passkeySessionToken } });
  } catch (err) {
    next(err);
  }
}

// ── POST /auth/passkey/auth/complete ──────────────────────────────────────────
// Public endpoint — verifies the assertion and returns tokens + session.

const CompleteAuthenticationSchema = z.object({
  passkeySessionToken: z.string().uuid("passkeySessionToken must be a UUID"),
  assertion:           z.record(z.unknown()),   // AuthenticationResponseJSON — opaque JSON
});

export async function completeAuthenticationController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const parsed = CompleteAuthenticationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Invalid authentication payload" });
      return;
    }

    const ip        = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim()
                      ?? req.socket?.remoteAddress
                      ?? null;
    const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

    const result = await completeAuthentication({
      passkeySessionToken: parsed.data.passkeySessionToken,
      assertion:           parsed.data.assertion as never,
      db:                  getDbInstance(),
      ipAddress:           ip,
      userAgent,
    });

    const u = result.user;

    res.status(200).json({
      success: true,
      data: {
        user: {
          id:                  u.id,
          email:               u.email,
          status:              u.status,
          kyc_level:           u.kyc_level,
          is_email_verified:   u.is_email_verified,
          roles:               result.rbac.roles,
          permissions:         result.rbac.permissions,
          has_transaction_pin: !!(u.transaction_pin_hash),
        },
        tokens: {
          access_token:             result.tokens.access_token,
          refresh_token:            result.tokens.refresh_token,
          access_token_expires_at:  result.tokens.access_token_expires_at,
          refresh_token_expires_at: result.tokens.refresh_token_expires_at,
        },
        session_id: result.sessionId,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /auth/passkey ─────────────────────────────────────────────────────────
// Returns the authenticated user's registered passkeys (no secrets).

export async function listPasskeysController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const passkeys = await listPasskeys(req.user!.id);
    res.status(200).json({ success: true, data: passkeys });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /auth/passkey/:id ──────────────────────────────────────────────────
// Revokes a passkey by its UUID row ID. Uses user_id ownership check to prevent IDOR.

export async function deletePasskeyController(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    if (!id) {
      res.status(400).json({ success: false, error: "Passkey id is required" });
      return;
    }
    await deletePasskey(req.user!.id, id);
    res.status(200).json({ success: true, message: "Passkey revoked." });
  } catch (err) {
    next(err);
  }
}
