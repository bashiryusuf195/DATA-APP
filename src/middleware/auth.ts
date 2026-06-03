// src/middleware/auth.ts
//
// Verifies the user's JWT and attaches their profile to req.user.
//
// Flow:
//   1. Extract "Bearer <token>" from the Authorization header
//   2. Send the token to Supabase to verify it's genuine and not expired
//   3. Look up the user's internal row, roles, and permissions in our DB
//   4. Cache the result in Redis (5 min) to avoid hitting the DB on every request
//   5. Attach to req.user for all downstream middleware and controllers
//
// Usage on any route:
//   router.get('/wallet', authenticate, walletController.getBalance);

import { Request, Response, NextFunction } from 'express';
import { supabase }                        from '../config/database';
import { db }                              from '../config/database';
import { cacheGet, cacheSet }              from '../config/redis';
import { UnauthorizedError, InvalidTokenError } from '../lib/errors';
import { logger }                          from '../lib/logger';

// Shape of the cached user context stored in Redis
interface UserContext {
  id:          string;
  authId:      string;
  email:       string;
  roles:       string[];
  permissions: string[];
}

export async function authenticate(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    // 1. Parse the Authorization header
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError(
        'Missing or malformed Authorization header. Expected: Bearer <token>',
      );
    }
    const token = authHeader.slice(7); // strip "Bearer "

    // 2. Verify with Supabase
    const { data: { user: supabaseUser }, error } =
      await supabase.auth.getUser(token);

    if (error || !supabaseUser) {
      throw new InvalidTokenError();
    }

    // 3. Check Redis cache before hitting the DB
    const cacheKey   = `user_ctx:${supabaseUser.id}`;
    let userContext  = await cacheGet<UserContext>(cacheKey);

    if (!userContext) {
      // 4a. Load from DB
      const userRow = await db('users')
        .where({ auth_id: supabaseUser.id, status: 'active' })
        .first();

      if (!userRow) {
        throw new UnauthorizedError('Account not found or has been suspended.');
      }

      // Use slug (e.g. "admin") not name (e.g. "Admin") — slugs are what
      // requireRole() and hasRole() compare against.
      const roles = await db('user_roles as ur')
        .join('roles as r', 'r.id', 'ur.role_id')
        .where({ 'ur.user_id': userRow.id })
        .where((qb) =>
          qb.whereNull('ur.expires_at').orWhere('ur.expires_at', '>', new Date())
        )
        .pluck('r.slug') as string[];

      // permissions table has (resource, action) — no name column.
      // Build "resource:action" strings, matching what hasPermission() expects.
      const permRows = await db('role_permissions as rp')
        .join('permissions as p', 'p.id', 'rp.permission_id')
        .join('roles as r',       'r.id', 'rp.role_id')
        .whereIn('r.slug', roles)
        .select('p.resource', 'p.action') as Array<{ resource: string; action: string }>;

      const permissions = [...new Set(permRows.map((row) => `${row.resource}:${row.action}`))];

      // super_admin gets wildcard permission so requirePermission("*:*") always passes
      if (roles.includes('super_admin')) permissions.push('*:*');

      userContext = {
        id:          userRow.id as string,
        authId:      supabaseUser.id,
        email:       supabaseUser.email ?? '',
        roles,
        permissions,
      };

      // 4b. Cache for 5 minutes
      await cacheSet(cacheKey, userContext, 300);
    }

    // 5. Attach to request
    req.user = userContext;
    next();

  } catch (err) {
    next(err);
  }
}

// ── Optional auth ─────────────────────────────────────────────────────────────
// Use on routes that work for both logged-in and anonymous users.
// req.user will be populated if a valid token is present; otherwise undefined.
export async function optionalAuth(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  if (req.headers['authorization']) {
    return authenticate(req, res, next);
  }
  next();
}
