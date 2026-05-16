/**
 * Development utility — deletes all Redis keys that belong to the rate
 * limiter (prefix "rl:*").  Useful after testing failure flows so you
 * are not locked out while developing.
 *
 * Usage:
 *   npm run clear:rate-limits
 */

import { redis } from "../src/config/redis";

async function clearRateLimits(): Promise<void> {
  const pattern = "rl:*";
  let cursor     = "0";
  let deleted    = 0;

  console.log(`Scanning Redis for keys matching "${pattern}" …`);

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH", pattern,
      "COUNT", "200"
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
      console.log(`  deleted ${keys.length} keys (running total: ${deleted})`);
    }
  } while (cursor !== "0");

  console.log(`\nDone. Removed ${deleted} rate-limit key(s).`);
}

clearRateLimits()
  .catch((err: Error) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => {
    redis.quit().catch(() => undefined);
  });
