// src/config/redis.ts
//
// Single Redis connection shared by:
//   - BullMQ (job queues)
//   - Rate limiter store
//   - Idempotency key cache
//   - Service-catalog cache
//   - Provider-config cache
//   - Distributed wallet locks

import Redis   from 'ioredis';
import { config } from './index';

export const redis = new Redis(config.redis.url, {
  // Reconnect with exponential backoff (max 3 s between retries)
  retryStrategy: (times: number) => Math.min(times * 500, 3_000),

  // Don't open the connection until the first command is issued
  lazyConnect: true,

  maxRetriesPerRequest: null,
});

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/** Store a JSON value with a TTL (seconds). */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

/** Retrieve a cached value. Returns null if not found or expired. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Delete a cached value. */
export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

/**
 * Acquire a distributed lock.
 * Returns true  → lock acquired; you own it for ttlSeconds.
 * Returns false → someone else already holds this lock.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const result = await redis.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

/** Release a lock you previously acquired. */
export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}
