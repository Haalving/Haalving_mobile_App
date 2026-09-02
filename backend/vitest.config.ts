import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * TESTS GET THEIR OWN DATABASE.
 *
 * They used to run against `backend/.env` — the same Postgres the dev server
 * serves — and every suite truncates as it goes. `community.test.ts` deletes every
 * gathering that is not one of the seeded three before each test, so anything
 * created in the browser vanished the next time anybody ran the suite. It also cut
 * the other way: a running dev server made the suites fail in ways that looked
 * like real defects.
 *
 * `.env.test` holds the same credentials pointed at `haalving_test` and Redis
 * database 1. Injecting them here rather than in a setup file matters: they are on
 * `process.env` before any module loads, and `dotenv/config` in `src/config/env.ts`
 * does not overwrite variables that are already set — so these win inside a test
 * run and change nothing anywhere else.
 */
const testEnv = loadEnv({ path: '.env.test' }).parsed ?? {};

/*
 * A LOCAL REDIS, WHEN THERE IS ONE.
 *
 * Every rate-limited route touches Redis, so a REMOTE Redis pays a round-trip on
 * each call and that is a large share of a full-suite run. Point the suites at a
 * local instance by setting `REDIS_URL_TEST` — in the shell, or in `.env.test` —
 * and it wins over the plain `REDIS_URL`. Unset, nothing changes: the suites use
 * the same `REDIS_URL` as before.
 */
const redisUrl = process.env.REDIS_URL_TEST ?? testEnv.REDIS_URL_TEST ?? testEnv.REDIS_URL;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /* one database, one migration state: the suites share a schema and clean up
       after themselves, so running them in parallel would have them truncating
       each other's rows mid-assertion */
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    /* silences the logger and relaxes nothing else — the suites run against the
       same rules production does */
    env: {
      NODE_ENV: 'test',
      ...(testEnv.DATABASE_URL ? { DATABASE_URL: testEnv.DATABASE_URL } : {}),
      ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    },
  },
});
