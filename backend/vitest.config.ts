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
      ...(testEnv.REDIS_URL ? { REDIS_URL: testEnv.REDIS_URL } : {}),
    },
  },
});
