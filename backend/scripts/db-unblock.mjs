/**
 * Clear a failed migration record, then apply everything that is pending.
 *
 * WHY THIS EXISTS. A migration failed part-way on the deployed database and
 * Prisma recorded the failure. From that moment `migrate deploy` refuses to apply
 * ANYTHING — verified: it exits 1 with P3009 even when nothing is pending, and
 * even after the failed migration's own folder is deleted from the repo, because
 * the record lives in the database rather than on disk. Every migration since has
 * been stuck behind it, which is why `gatherings.createdById` does not exist on a
 * server whose code selects it.
 *
 * `--rolled-back` is the correct flag and `--applied` is not. `--applied` reads
 * the migration folder off disk and would claim a migration succeeded that never
 * ran; `--rolled-back` sends only the name, so it works whether or not the folder
 * is still there and it tells the truth about what happened.
 *
 * SAFE TO RUN TWICE. Resolving a name that is not blocked is reported and
 * ignored; `migrate deploy` on an up-to-date database says so and exits 0.
 */
import { execFileSync } from 'node:child_process';

const BLOCKED = process.argv.slice(2);
const names = BLOCKED.length ? BLOCKED : ['20260830090000_task_absorbs_worklist'];

const run = (args) =>
  execFileSync('npx', ['prisma', ...args], { stdio: 'inherit', shell: process.platform === 'win32' });

for (const name of names) {
  console.log(`\n— clearing the failed record for ${name}`);
  try {
    run(['migrate', 'resolve', '--rolled-back', name]);
  } catch {
    /* not blocked, or already resolved — either way there is nothing to clear and
       the deploy below is the thing that matters */
    console.log(`  (nothing to clear for ${name})`);
  }
}

console.log('\n— applying every pending migration');
run(['migrate', 'deploy']);

console.log('\nDone. If this printed "All migrations have been successfully applied",');
console.log('the database now matches the deployed code.');
