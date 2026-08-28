import { Redis } from 'ioredis';

import { env, isDev } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Redis holds the rate-limit counters and the OTP throttle — state that is
 * per-attempt, short-lived, and has no business in Postgres.
 *
 * THE LIMITER FAILS OPEN, AND THAT HAS TO BE FAST.
 *
 * Failing open is a deliberate trade for a health product: a limiter that fails
 * closed locks every client out of their own plan the moment a cache node blinks,
 * and brute force is not the only thing standing in the way — the OTP attempt
 * counter lives in Postgres and password verification is bcrypt at cost 12.
 *
 * But "fails open" is only true if a command against a dead Redis RETURNS. With
 * ioredis defaults it does not: commands queue while the client reconnects, so a
 * sign-in hangs until the HTTP client gives up — which is worse than either
 * failing open or failing closed, because nothing reports it. That was observed
 * here, with the daemon stopped and every login hanging for minutes.
 *
 * The three settings below are what make the promise real:
 *
 *   maxRetriesPerRequest: 1   a command gives up after one retry instead of
 *                             queueing for ever
 *   commandTimeout            a hard ceiling, so even a half-open socket returns
 *   enableOfflineQueue: false while disconnected, commands REJECT immediately
 *                             rather than buffering
 *
 * All three surface as a rejected promise, which the limiter already catches and
 * treats as "allow the request".
 */
const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    /*
     * 3s, not 1s — this Redis is REMOTE.
     *
     * A hosted instance answers in ~220ms from here, so a 1s ceiling left barely
     * four round trips of headroom and would have started timing out under
     * ordinary jitter. Every timeout silently disables rate limiting for that
     * request (the limiter fails open), so a ceiling set too tight does not
     * degrade loudly — it degrades invisibly.
     */
    commandTimeout: 3_000,
    /* a TCP handshake across the internet is not a loopback connect */
    connectTimeout: 10_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    /* back off to a 5s ceiling: a node that is genuinely gone should not be
       hammered, and the limiter is degraded rather than broken while it is */
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });

if (isDev) globalForRedis.redis = redis;

/**
 * Logged once per state change, not once per failed command.
 *
 * ioredis re-emits `error` on every reconnect attempt, so logging each one turns
 * a brief outage into thousands of identical lines and buries whatever actually
 * needs reading. With a REMOTE Redis this matters more, not less: a dropped
 * link is an ordinary event on the public internet, not an incident.
 */
let lastErrorCode: string | null = null;

redis.on('error', (err: Error & { code?: string }) => {
  const code = err.code ?? err.message ?? 'unknown';
  if (code === lastErrorCode) return;
  lastErrorCode = code;
  logger.warn({ code, message: err.message }, 'redis unavailable — rate limiting is degraded');
});

redis.on('ready', () => {
  if (lastErrorCode) logger.info('redis reconnected — rate limiting restored');
  lastErrorCode = null;
});

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'end') return;
  try {
    await redis.quit();
  } catch {
    /* already gone — nothing to close */
  }
}
