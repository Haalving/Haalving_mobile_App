/**
 * ONE-OFF prod migration recovery.
 *
 * The prod DB is stuck: `task_absorbs_worklist` (Aug 30) and `gathering_approval`
 * (Sep 1, with a duplicate row) are recorded as FAILED, so `prisma migrate deploy`
 * refuses (P3009) and every later migration (client_plan … client_trackers) never
 * runs. Verified safe: none of those failed migrations partially applied — their
 * columns/tables do not exist — so re-applying them fresh cannot conflict.
 *
 * This script:
 *   1. BACKS UP the whole _prisma_migrations table to backend/prisma_migrations_backup.json
 *   2. deletes only the rows with finished_at IS NULL (the 4 failed/duplicate rows),
 *      leaving the 15 good ones untouched
 *   3. runs `prisma migrate deploy`, which applies the ~11 pending migrations in order
 *
 * RUN IT with the Railway PUBLIC Postgres URL (Postgres → Variables → DATABASE_PUBLIC_URL,
 * or the proxy string under Settings → Networking):
 *
 *   cd backend
 *   DATABASE_URL="postgresql://postgres:PASSWORD@altaria.proxy.rlwy.net:30628/railway" node fix-prod-migrations.mjs
 *
 * After it prints "All migrations applied", redeploy the Backend service and DISABLE
 * public access again. Then delete this file — it is a one-off.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url || !/(proxy\.rlwy\.net|rlwy\.net|railway)/.test(url) || /localhost|127\.0\.0\.1/.test(url)) {
  console.error('Refusing to run: set DATABASE_URL to the Railway PUBLIC Postgres URL first (not localhost).');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const num = (k, v) => (typeof v === 'bigint' ? Number(v) : v);

try {
  const all = await prisma.$queryRawUnsafe(
    'SELECT id, migration_name, started_at, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at',
  );
  writeFileSync('prisma_migrations_backup.json', JSON.stringify(all, num, 1));
  console.log(`Backed up ${all.length} rows -> backend/prisma_migrations_backup.json`);

  const bad = all.filter((r) => r.finished_at === null);
  if (bad.length === 0) {
    console.log('Nothing to clear — no failed rows. Proceeding straight to migrate deploy.');
  } else {
    console.log(`Clearing ${bad.length} failed/duplicate rows:`);
    for (const r of bad) console.log('  - ' + r.migration_name + (r.rolled_back_at ? ' [rolled-back]' : ' [failed]'));
    const n = await prisma.$executeRawUnsafe('DELETE FROM _prisma_migrations WHERE finished_at IS NULL');
    console.log(`Deleted ${n} rows. Remaining rows are all finished migrations.`);
  }
} catch (e) {
  console.error('DB step failed:', String(e).replace(/:[^:@/]+@/g, ':***@').slice(0, 400));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

console.log('\nApplying pending migrations (prisma migrate deploy)…\n');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
  console.log('\n✅ All migrations applied. Now: redeploy the Backend service, disable public access, and delete this file.');
} catch {
  console.error('\nmigrate deploy failed — the backup is at backend/prisma_migrations_backup.json. Do not retry blindly; share the output.');
  process.exit(1);
}
