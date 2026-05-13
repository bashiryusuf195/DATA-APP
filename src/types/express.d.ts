// src/types/express.d.ts
//
// TypeScript "declaration merging" — adds our custom fields to Express's
// built-in Request type so TypeScript knows about req.user and req.traceId
// without needing a cast everywhere.
//
// After this file, anywhere in the codebase you can write:
//   req.user?.id          ← the logged-in user's internal UUID
//   req.user?.permissions ← array of permission strings
//   req.traceId           ← UUID set by requestLogger middleware

import 'express';

declare module 'express' {
  interface Request {
    /**
     * Set by the `authenticate` middleware after JWT verification.
     * Undefined on unauthenticated routes.
     */
    user?: {
      /** Internal UUID from our `users` table. */
      id:          string;
      /** Supabase auth.users UUID (the `sub` claim in the JWT). */
      authId:      string;
      /** User's email address. */
      email:       string;
      /** Role names e.g. ['customer'] or ['admin', 'superadmin']. */
      roles:       string[];
      /** Flat list of permission strings e.g. ['transactions:read', 'wallet:read']. */
      permissions: string[];
    };

    /**
     * UUID assigned by `requestLogger` middleware at the start of every request.
     * Included in every log line and returned in the X-Trace-Id response header.
     * Use this to correlate all log lines for a single HTTP request.
     */
    traceId?: string;
  }
}
