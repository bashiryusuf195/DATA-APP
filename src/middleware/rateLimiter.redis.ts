import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { redis } from "../config/redis";

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
function makeRedisLimiter({
  prefix,
  windowMs,
  max,
  keyGenerator,
}: {
  prefix: string;
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
}) {
  return rateLimit({
    windowMs,
    max,
    // legacyHeaders → X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
    // standardHeaders → RateLimit-* + Retry-After
    legacyHeaders:   true,
    standardHeaders: true,
    store: new RedisStore(prefix, windowMs),
    keyGenerator,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: "Too many requests",
        code:  "RATE_LIMIT_EXCEEDED",
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
});

/** Auth — register: 3 per hour per IP */
export const registerRateLimiter = makeRedisLimiter({
  prefix:       "register",
  windowMs:     60 * 60 * 1000,
  max:          3,
  keyGenerator: getClientIp,
});

/** Transactions — purchases: 20 per min per authenticated user */
export const purchaseRateLimiter = makeRedisLimiter({
  prefix:       "purchase",
  windowMs:     60 * 1000,
  max:          20,
  keyGenerator: (req) => req.user?.id ?? getClientIp(req),
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
});
