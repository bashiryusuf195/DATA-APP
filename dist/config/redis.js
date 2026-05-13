"use strict";
// src/config/redis.ts
//
// Single Redis connection shared by:
//   - BullMQ (job queues)
//   - Rate limiter store
//   - Idempotency key cache
//   - Service-catalog cache
//   - Provider-config cache
//   - Distributed wallet locks
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.checkRedisHealth = checkRedisHealth;
exports.cacheSet = cacheSet;
exports.cacheGet = cacheGet;
exports.cacheDel = cacheDel;
exports.acquireLock = acquireLock;
exports.releaseLock = releaseLock;
const ioredis_1 = __importDefault(require("ioredis"));
const index_1 = require("./index");
exports.redis = new ioredis_1.default(index_1.config.redis.url, {
    // Reconnect with exponential backoff (max 3 s between retries)
    retryStrategy: (times) => Math.min(times * 500, 3_000),
    // Don't open the connection until the first command is issued
    lazyConnect: true,
    maxRetriesPerRequest: null,
});
// ── Health check ──────────────────────────────────────────────────────────────
async function checkRedisHealth() {
    try {
        const pong = await exports.redis.ping();
        return pong === 'PONG';
    }
    catch {
        return false;
    }
}
// ── Convenience helpers ───────────────────────────────────────────────────────
/** Store a JSON value with a TTL (seconds). */
async function cacheSet(key, value, ttlSeconds) {
    await exports.redis.setex(key, ttlSeconds, JSON.stringify(value));
}
/** Retrieve a cached value. Returns null if not found or expired. */
async function cacheGet(key) {
    const raw = await exports.redis.get(key);
    if (raw === null)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/** Delete a cached value. */
async function cacheDel(key) {
    await exports.redis.del(key);
}
/**
 * Acquire a distributed lock.
 * Returns true  → lock acquired; you own it for ttlSeconds.
 * Returns false → someone else already holds this lock.
 */
async function acquireLock(key, ttlSeconds) {
    const result = await exports.redis.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
}
/** Release a lock you previously acquired. */
async function releaseLock(key) {
    await exports.redis.del(`lock:${key}`);
}
//# sourceMappingURL=redis.js.map