// src/middleware/rateLimiter.ts
//
// Three rate-limit tiers used across the app:
//
//   standardLimiter     — applied globally to all routes (60 req / min per user)
//   strictLimiter       — auth and payment routes (10 req / min per IP)
//   transactionLimiter  — POST /transactions (30 req / min per user)
//
// Key is the authenticated user's ID when available, otherwise the IP.
// This stops one user from affecting another's limits.

import rateLimit from 'express-rate-limit';
import { Request, Response }  from 'express';
import { config }              from '../config';

// Reusable handler so the response format matches our global error shape
function makeHandler(retryAfterSec: number) {
  return (_req: Request, res: Response) => {
    res.status(429).json({
      error:      'Too many requests. Please slow down and try again.',
      code:       'RATE_LIMIT_EXCEEDED',
      retryAfter: retryAfterSec,
    });
  };
}

// ── Standard: 60 req / min per user (or IP when unauthenticated) ──────────────
export const standardLimiter = rateLimit({
  windowMs:     config.rateLimit.windowMs,
  max:          config.rateLimit.max,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'unknown',
  handler:      makeHandler(Math.ceil(config.rateLimit.windowMs / 1_000)),
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Strict: 10 req / min per IP (login, registration, payments) ───────────────
export const strictLimiter = rateLimit({
  windowMs:     60_000,
  max:          10,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  handler:      makeHandler(60),
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Transaction: 30 req / min per user ────────────────────────────────────────
export const transactionLimiter = rateLimit({
  windowMs:     60_000,
  max:          30,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'unknown',
  handler:      makeHandler(60),
  standardHeaders: true,
  legacyHeaders:   false,
});
