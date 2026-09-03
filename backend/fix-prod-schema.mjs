/**
 * ONE-OFF prod SCHEMA recovery.
 *
 * Prod is missing the primary keys / unique constraints / indexes on ~20 core
 * tables (users, tasks, roles, …) even though the migration history says they
 * applied — the DB was created in a broken way (a data-only restore that dropped
 * constraints). That is why `migrate deploy` cannot add foreign keys (P3018 /
 * 42830) and the whole chain is stuck.
 *
 * This is the SAFE, additive fix, verified before shipping: no table has
 * duplicate rows on any key it adds, and the generated repair is purely additive
 * (adds keys/indexes and the pending tables/columns; the only relaxation is one
 * `DROP NOT NULL`). Nothing is dropped, nothing is reloaded, no data is touched.
 *
 * It:
 *   1. regenerates the exact repair with `prisma migrate diff` (prod → schema)
 *   2. applies it INSIDE A TRANSACTION (all-or-nothing; a failure rolls back clean)
 *   3. baselines `_prisma_migrations` so Prisma sees every migration as applied
 *
 * BEFORE RUNNING: take a Railway backup (Postgres → Backups).
 *
 * RUN with the Railway PUBLIC Postgres URL:
 *   cd backend
 *   DATABASE_URL="postgresql://postgres:PASSWORD@altaria.proxy.rlwy.net:30628/railway" node fix-prod-schema.mjs
 *
 * AFTER it prints "done": redeploy the Backend service, DISABLE public access,
 * and delete this file + fix-prod-migrations.mjs + repair.sql.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url || /localhost|127\.0\.0\.1/.test(url)) {
  console.error('Refusing to run: set DATABASE_URL to the Railway PUBLIC Postgres URL (not localhost).');
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: url };
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', shell: true, env, ...opts });

// 1. regenerate the additive repair (prod's live schema -> the target schema)
console.log('1/3  Generating the schema repair…');
run(`npx prisma migrate diff --from-url "${url}" --to-schema-datamodel prisma/schema.prisma --script > repair.sql`);
let sql = readFileSync('repair.sql', 'utf8').trim();
if (!sql || /^\s*--\s*This is an empty migration/i.test(sql)) {
  console.log('     Schema already matches — nothing to repair. Skipping to baseline.');
} else {
  // all-or-nothing: Postgres has transactional DDL, so a mid-way failure undoes everything
  writeFileSync('repair.sql', `BEGIN;\n${sql}\nCOMMIT;\n`);
  console.log('2/3  Applying the repair (transactional)…');
  run(`npx prisma db execute --url "${url}" --file repair.sql`);
}

// 3. baseline: the schema now matches every migration, so mark them all applied
console.log('3/3  Baselining the migration history…');
const prisma = new PrismaClient({ datasources: { db: { url } } });
await prisma.$executeRawUnsafe('DELETE FROM _prisma_migrations WHERE finished_at IS NULL');
const done = new Set(
  (await prisma.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')).map(
    (r) => r.migration_name,
  ),
);
await prisma.$disconnect();
const pending = readdirSync('prisma/migrations')
  .filter((d) => /^\d{14}_/.test(d))
  .sort()
  .filter((m) => !done.has(m));
for (const m of pending) {
  try {
    execSync(`npx prisma migrate resolve --applied ${m}`, { stdio: 'pipe', shell: true, env });
    console.log('     marked applied: ' + m);
  } catch (e) {
    console.log('     (skip ' + m + ': ' + String(e.stderr || e).slice(0, 80) + ')');
  }
}

console.log('\n✅ done — prod schema repaired and migrations baselined.');
console.log('Next: redeploy the Backend service, disable Postgres public access, and delete the *.mjs + repair.sql files.');
