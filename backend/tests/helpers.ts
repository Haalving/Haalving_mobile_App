import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { redis } from '../src/config/redis.js';

/**
 * These suites run against the SEEDED development database, and assert against
 * the demo's own personas — Anita, Vikram, Sneha, Arjun. That is deliberate: the
 * seed is the story the client accepted, so a test that says "Vikram sees six
 * clients" is checking the product's behaviour rather than a fixture invented to
 * make the test pass.
 *
 * Run `pnpm db:seed` first. The seed is idempotent, so re-running it before a
 * test run costs nothing and makes the suite deterministic.
 */

export const app: Express = createApp();

export const STAFF_PASSWORD = 'Haalving@123';

/**
 * Clear the rate-limit buckets.
 *
 * Staff login allows ten attempts per IP per fifteen minutes, and every test in
 * this file arrives from 127.0.0.1. Without this, the second `pnpm test` inside a
 * quarter of an hour fails on 429s that say nothing about the code.
 */
export async function clearRateLimits(): Promise<void> {
  try {
    /*
     * CONNECT FIRST. The client is `lazyConnect` with `enableOfflineQueue: false`
     * — the pair that makes the production limiter fail open FAST instead of
     * queueing against a dead node. The side effect is that the very first
     * command throws if nothing has connected yet, and the catch below would
     * swallow it: the clear silently does nothing, the counters survive, and the
     * next suite fails on 429s that look like broken auth.
     *
     * That is exactly what happened when Redis moved from a local container to a
     * hosted instance. One await fixes it.
     */
    if (redis.status !== 'ready') await redis.connect();

    /* SCAN, not KEYS: this Redis is shared and remote, and KEYS blocks the
       server for the length of the keyspace. */
    let cursor = '0';
    const keys: string[] = [];
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'rl:*', 'COUNT', 500);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length) await redis.del(...keys);
  } catch {
    /* Redis genuinely unreachable: the limiter fails open, so the tests still
       mean what they say — they just cannot pre-clear. */
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: string; name: string };
}

/** Sign in as a staff persona. `X-Client: mobile` puts the refresh token in the body. */
export async function loginStaff(handle: string): Promise<Session> {
  const res = await request(app)
    .post('/api/v1/auth/staff/login')
    .set('X-Client', 'mobile')
    .send({ email: `${handle}@haalving.dev`, password: STAFF_PASSWORD });

  if (res.status !== 200) {
    throw new Error(`login failed for ${handle}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data as Session;
}

/**
 * Put a known code in the OTP table and sign in with it.
 *
 * The stored value is a hash, so a test cannot read the real code back — which is
 * the point of storing it that way. Writing a known one is the honest way to
 * exercise the verify path without weakening the production flow.
 */
export async function issueTestOtp(phone: string, code = '123456'): Promise<void> {
  const { createHash } = await import('node:crypto');
  const codeHash = createHash('sha256').update(`${phone}:${code}`).digest('hex');

  await prisma.otp.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } });
  await prisma.otp.create({
    data: { phone, codeHash, expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
}

export function auth(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

export async function closeConnections(): Promise<void> {
  await prisma.$disconnect();
  try {
    await redis.quit();
  } catch {
    /* already closed */
  }
}
