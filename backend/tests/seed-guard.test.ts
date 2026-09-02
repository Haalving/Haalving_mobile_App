import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/**
 * THE DEMO SEED MUST NEVER RUN IN PRODUCTION. The guard is the last line between a
 * mis-set NODE_ENV and eleven demo staff in a real database, so it earns a test
 * that actually invokes the script — the guard runs before any write, so this is
 * safe and touches no data.
 */
describe('seed guards', () => {
  it('the demo seed refuses under NODE_ENV=production', () => {
    const run = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      shell: true,
      timeout: 60_000,
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    expect(run.status, 'seed.ts must exit non-zero in production').not.toBe(0);
    expect(output).toContain('must never run in production');
  }, 70_000);
});
