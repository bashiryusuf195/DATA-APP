import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { redis } from "../config/redis";
import { config } from "../config";
import { logger } from "../lib/logger";

// Atomically INCR the key and set a PEXPIRE on the first hit only.
// Returns an array [hitCount, remainingTtlMs].
// Using Lua ensures no window is ever created without a TTL.
const LUA_INCREMENT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local pttl = redis.call('PTTL', KEYS[1])
return {current, pttl}
`;

export function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

// ── Custom Redis store ────────────────────────────────────────────────────────
// Implements the express-rate-limit v7 Store contract.
// Fails open: if Redis is unavailable every request is treated as hit #1,
// so traffic keeps flowing rather than being blocked by infrastructure issues.
class RedisStore {
  readonly windowMs: number;
  private readonly keyPrefix: string;

  constructor(keyPrefix: string, windowMs: number) {
    this.keyPrefix  = keyPrefix;
    this.windowMs   = windowMs;
  }

  async increment(
    key: string
  ): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    try {
      const redisKey = `rl:${this.keyPrefix}:${key}`;
      const result   = (await redis.eval(
        LUA_INCREMENT,
        1,
        redisKey,
        this.windowMs.toString()
      )) as [number, number];

      const [totalHits, pttl] = result;
      const resetTime = new Date(
        Date.now() + (pttl > 0 ? pttl : this.windowMs)
      );
      return { totalHits, resetTime };
    } catch {
      // Fail open — treat as first hit so the request is not blocked.
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await redis.decr(`rl:${this.keyPrefix}:${key}`);
    } catch {
      // ignore
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await redis.del(`rl:${this.keyPrefix}:${key}`);
    } catch {
      // ignore
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────
// devOverride: applied only when NODE_ENV=development.
// Allows shorter windows / higher limits so local testing isn't blocked.
// Production limits are always enforced when NODE_ENV != development.
// logKey: when set, emits a rate_limit_triggered log on every blocked request.
function makeRedisLimiter({
  prefix,
  windowMs,
  max,
  keyGenerator,
  devOverride,
  logKey,
}: {
  prefix: string;
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
  devOverride?: { windowMs?: number; max?: number };
  logKey?: string;
}) {
  const effectiveWindowMs = config.isDev && devOverride?.windowMs !== undefined
    ? devOverride.windowMs
    : windowMs;
  const effectiveMax = config.isDev && devOverride?.max !== undefined
    ? devOverride.max
    : max;

  return rateLimit({
    windowMs: effectiveWindowMs,
    max:      effectiveMax,
    // legacyHeaders → X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
    // standardHeaders → RateLimit-* + Retry-After
    legacyHeaders:   true,
    standardHeaders: true,
    store: new RedisStore(prefix, effectiveWindowMs),
    keyGenerator,
    handler: (req: Request, res: Response) => {
      const retryAfterHeader = res.getHeader("Retry-After");
      const retry_after = retryAfterHeader !== undefined ? Number(retryAfterHeader) : undefined;

      if (logKey) {
        logger.warn("rate_limit_triggered", {
          limiter:  logKey,
          user_id:  (req as Request & { user?: { id: string } }).user?.id,
          ip:       getClientIp(req),
          path:     req.path,
          method:   req.method,
        });
      }

      res.status(429).json({
        success:     false,
        code:        "RATE_LIMIT_EXCEEDED",
        message:     "Too many attempts. Please try again later.",
        retry_after,
      });
    },
  });
}

// ── Named limiters ────────────────────────────────────────────────────────────

// ── Failed-login limiter ──────────────────────────────────────────────────────
// Not express-rate-limit middleware — called explicitly from loginController
// so only FAILED attempts count, and a successful login resets the counter.
//
// Key: rl:login_failed:<email_lc>:<ip>   Window: 15 min   Max: 5 failures

const FAILED_LOGIN_MAX_ATTEMPTS = 5;
const FAILED_LOGIN_WINDOW_MS    = 15 * 60 * 1000;

function failedLoginKey(email: string, ip: string): string {
  return `rl:login_failed:${email.toLowerCase()}:${ip}`;
}

export const failedLoginLimiter = {
  async check(
    email: string,
    ip: string
  ): Promise<{ blocked: boolean; retryAfterSec: number }> {
    try {
      const raw = await redis.get(failedLoginKey(email, ip));
      if (raw !== null && parseInt(raw, 10) >= FAILED_LOGIN_MAX_ATTEMPTS) {
        const pttl = await redis.pttl(failedLoginKey(email, ip));
        return {
          blocked:       true,
          retryAfterSec: Math.ceil((pttl > 0 ? pttl : FAILED_LOGIN_WINDOW_MS) / 1000),
        };
      }
      return { blocked: false, retryAfterSec: 0 };
    } catch {
      return { blocked: false, retryAfterSec: 0 }; // fail open
    }
  },

  async increment(email: string, ip: string): Promise<void> {
    try {
      await redis.eval(
        LUA_INCREMENT,
        1,
        failedLoginKey(email, ip),
        FAILED_LOGIN_WINDOW_MS.toString()
      );
    } catch {
      // ignore — fail open
    }
  },

  async reset(email: string, ip: string): Promise<void> {
    try {
      await redis.del(failedLoginKey(email, ip));
    } catch {
      // ignore
    }
  },
};

/** Auth — login: 30 requests per 15 min per IP (soft flood guard).
 *  Credential-based brute-force protection is handled separately by
 *  failedLoginLimiter, which only counts actual failed attempts. */
export const loginRateLimiter = makeRedisLimiter({
  prefix:       "login",
  windowMs:     15 * 60 * 1000,
  max:          30,
  keyGenerator: getClientIp,
  logKey:       "login",
});

/** Auth — register: 3 per hour per IP (prod) / 30 per 15 min per IP (dev) */
export const registerRateLimiter = makeRedisLimiter({
  prefix:       "register",
  windowMs:     60 * 60 * 1000,  // 1 hour
  max:          3,                // production: 3 per hour
  keyGenerator: getClientIp,
  devOverride: {
    windowMs: 15 * 60 * 1000,   // dev: 15-min window
    max:      30,                // dev: 30 attempts per 15 min
  },
  logKey: "register",
});

/** Transactions — purchases: 20 per min per authenticated user */
export const purchaseRateLimiter = makeRedisLimiter({
  prefix:       "purchase",
  windowMs:     60 * 1000,
  max:          20,
  keyGenerator: (req) => req.user?.id ?? getClientIp(req),
  logKey:       "purchase",
});

/** Wallet — balance: 60 per min per authenticated user */
export const balanceRateLimiter = makeRedisLimiter({
  prefix:       "balance",
  windowMs:     60 * 1000,
  max:          60,
  keyGenerator: (req) => req.user?.id ?? getClientIp(req),
});

/** Admin endpoints: 100 per min per authenticated admin user */
export const adminRateLimiter = makeRedisLimiter({
  prefix:       "admin",
  windowMs:     60 * 1000,
  max:          100,
  keyGenerator: (req) => req.user?.id ?? getClientIp(req),
});

/** Provider webhooks: 120 per min per providerCode */
export const webhookRateLimiter = makeRedisLimiter({
  prefix:       "webhook",
  windowMs:     60 * 1000,
  max:          120,
  keyGenerator: (req) => req.params.providerCode || getClientIp(req),
  logKey:       "webhook",
});

/** 2FA login verify: 10 attempts per 5 min per IP */
export const twoFactorVerifyLimiter = makeRedisLimiter({
  prefix:       "2fa_verify",
  windowMs:     5 * 60 * 1000,
  max:          10,
  keyGenerator: getClientIp,
  logKey:       "2fa_verify",
});

/** Wallet funding — initialize: 10 per 15 min per authenticated user */
export const fundingRateLimiter = makeRedisLimiter({
  prefix:       "funding",
  windowMs:     15 * 60 * 1000,
  max:          10,
  keyGenerator: (req) => req.user?.id ?? getClientIp(req),
  logKey:       "funding",
});

/** Verification endpoints (/electricity/verify, /cable-tv/verify):
 *  5 per min per authenticated user — tighter than the generic purchase limiter
 *  because verification hits an external provider API on every call. */
export const verificationRateLimiter = makeRedisLimiter({
  prefix:       "verification",
  windowMs:     60 * 1000,
  max:          5,
  keyGenerator: (req) => req.user?.id ?? getClientIp(req),
  logKey:       "verification",
});

/** Admin sensitive operations (freeze, unfreeze, create risk flag, reset circuit):
 *  10 per 5 min per authenticated admin — prevents bulk automation of destructive ops. */
export const adminSensitiveLimiter = makeRedisLimiter({
  prefix:       "admin_sensitive",
  windowMs:     5 * 60 * 1000,
  max:          10,
  keyGenerator: (req) => req.user?.id ?? getClientIp(req),
  logKey:       "admin_sensitive",
});
