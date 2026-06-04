// src/modules/auth/middleware/rateLimiter.ts
// Rate-limit presets for auth endpoints.
// In-memory store is fine for single-process; swap to
// rate-limit-redis for multi-process / multi-pod deployments.

import rateLimit, { type Options } from "express-rate-limit";

function jsonHandler(action: string): Options["handler"] {
  return (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code:    "TOO_MANY_REQUESTS",
        message: `Too many ${action} attempts. Please wait and try again.`,
      },
    });
  };
}

/**
 * Login: 10 attempts per 15 min, keyed by IP + email.
 * Composite key makes credential-stuffing across IPs harder.
 */
export const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("login"),
  keyGenerator: (req) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim()
               ?? req.socket.remoteAddress
               ?? "unknown";
    const email = ((req.body as { email?: string })?.email ?? "").toLowerCase();
    return `login:${ip}:${email}`;
  },
});

/** Register: 5 per hour per IP. */
export const registerLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("registration"),
});

/** Token refresh: 30 per 15 min per IP. */
export const refreshLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("token refresh"),
});

/** Forgot password: 5 per 15 min per IP — tight because each call triggers an outbound email. */
export const forgotPasswordLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("password reset request"),
});

/** Reset password (token exchange): 10 per 15 min per IP. */
export const resetPasswordLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("password reset"),
});

/** Change password: 5 per hour per user. */
export const changePasswordLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("password change"),
  keyGenerator: (req) => {
    const userId = (req as { user?: { id?: string } }).user?.id ?? "anon";
    return `change-pw:${userId}`;
  },
});

/** Passkey auth begin: 20 per 15 min per IP — prevents credential enumeration. */
export const passkeyAuthBeginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("passkey authentication"),
});

/** Passkey auth complete: 10 per 15 min per IP. */
export const passkeyAuthCompleteLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("passkey authentication"),
});

/** Global catch-all: 300 requests per 15 min per IP. */
export const generalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler("API"),
});
