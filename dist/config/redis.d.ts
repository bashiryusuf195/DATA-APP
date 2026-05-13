import Redis from 'ioredis';
export declare const redis: Redis;
export declare function checkRedisHealth(): Promise<boolean>;
/** Store a JSON value with a TTL (seconds). */
export declare function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void>;
/** Retrieve a cached value. Returns null if not found or expired. */
export declare function cacheGet<T>(key: string): Promise<T | null>;
/** Delete a cached value. */
export declare function cacheDel(key: string): Promise<void>;
/**
 * Acquire a distributed lock.
 * Returns true  → lock acquired; you own it for ttlSeconds.
 * Returns false → someone else already holds this lock.
 */
export declare function acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
/** Release a lock you previously acquired. */
export declare function releaseLock(key: string): Promise<void>;
