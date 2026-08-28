import { defineConfig } from 'vitest/config';

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
    env: { NODE_ENV: 'test' },
  },
});
