import { Redis } from 'ioredis';

import { env, isDev } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Redis holds the rate-limit counters and the OTP throttle — state that is
 * per-attempt and short-lived, and has no business in Postgres.
 *
 * `maxRetriesPerRequest: null` keeps commands queued through a blip rather than
 * rejecting them: a dropped rate-limit write must not turn into a failed login.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 3_000),
  });

if (isDev) globalForRedis.redis = redis;

redis.on('error', (err: Error) => {
  /* logged, never thrown: the API stays up when Redis wobbles. What degrades is
     rate limiting, and a limiter that fails OPEN is the right trade for a health
     product — locking every client out of their own app is the worse outcome. */
  logger.error({ err: err.message }, 'redis error');
});

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'end') return;
  await redis.quit();
}
