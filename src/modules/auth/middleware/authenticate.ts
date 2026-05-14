// src/modules/auth/middleware/authenticate.ts
// Verifies the Bearer JWT and populates req.user + req.sessionId.
//
// Lookup order for token:
//   1. Authorization: Bearer <token>
//   2. Cookie: access_token (when SECURE_COOKIES=true)
//
// Strategy:
//   1. Verify Supabase JWT locally (no network) — validates sig + expiry
//   2. Look up users row by auth_id — confirms account still active
//   3. Look up session row by token_hash — confirms not revoked
//   4. Resolve RBAC context — embeds roles + permissions in req.user

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../../shared/errors/AppError";
import { verifySupabaseJwt } from "../services/supabase.service";
import { resolveUserRbac } from "../services/rbac.service";
import { getDbInstance } from "../../../db/knex";
import { sha256 } from "../../../lib/crypto";

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = req.cookies?.access_token as string | undefined;
  return cookie ?? null;
}

export async function authenticate(
  req:  Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const rawToken = extractBearer(req);

  if (!rawToken) {
    return next(new AppError(401, "TOKEN_MISSING", "Access token is required"));
  }

  try {
    const db = getDbInstance();

    // 1. Local JWT verification — fast, no network
    const jwtPayload = verifySupabaseJwt(rawToken);

    // 2. Load our user record by Supabase auth_id
    const user = await db("users")
      .where({ auth_id: jwtPayload.sub })
      .whereNull("deleted_at")
      .first(["id", "auth_id", "email", "status"]);

    if (!user) {
      return next(new AppError(401, "ACCOUNT_NOT_FOUND", "User account not found"));
    }

    if (user.status === "banned" || user.status === "deactivated") {
      return next(new AppError(403, "ACCOUNT_DISABLED", "Account is not active"));
    }

    // 3. Validate session — must be non-revoked + not expired
    const tokenHash = sha256(rawToken);
    const session = await db("sessions")
      .where({
        user_id:    user.id,
        token_hash: tokenHash,
        is_revoked: false,
      })
      .where("expires_at", ">", new Date())
      .first("id");

    if (!session) {
      return next(new AppError(401, "SESSION_REVOKED", "Session not found or has been revoked"));
    }

    // 4. Resolve RBAC
    const rbac = await resolveUserRbac(db, user.id as string);

    // 5. Populate request context
    req.user = {
      sub:         user.id      as string,
      id:          user.id      as string,
      auth_id:     user.auth_id as string,
      email:       user.email   as string,
      status:      user.status  as string,
      roles:       rbac.roles,
      permissions: rbac.permissions,
      session:     session.id   as string,
    };
    req.sessionId = session.id as string;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication — attaches req.user if a valid token is
 * present, but never rejects. Use on public routes that have
 * richer responses for authenticated users.
 */
export async function optionalAuth(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  const rawToken = extractBearer(req);
  if (!rawToken) return next();

  try {
    await authenticate(req, res, () => undefined);
    next();
  } catch {
    next();
  }
}
