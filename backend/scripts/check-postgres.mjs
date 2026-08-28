/**
 * Does the PostgreSQL named in DATABASE_URL answer?
 *
 *   node backend/scripts/check-postgres.mjs
 *   pnpm --filter @haalving/backend check:db
 *
 * It runs `SELECT 1` through Prisma — the same client and the same connection
 * string the API uses, so a pass here means the API can connect, not merely that
 * something is listening on the port.
 *
 * NOTHING SECRET IS EVER PRINTED. The URL is parsed to report host, port and
 * database name only; the user and password are never echoed, and any error text
 * is scrubbed of the password before it is shown. Errors are otherwise printed
 * VERBATIM, because a connection failure is only useful if you can read what the
 * driver actually said.
 *
 * Exit 0 = reachable. Exit 1 = not. Intended as a gate before any schema work.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`Cannot read ${envPath}. Copy the block from .env.example and fill it in.`);
    process.exit(1);
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv();
const url = env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set in backend/.env.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch (err) {
  console.error(`DATABASE_URL is not a valid URL: ${err.message}`);
  process.exit(1);
}

/** Never let the password reach the terminal, whatever the driver put in its message. */
const secret = parsed.password;
const scrub = (s) => (secret ? String(s).split(secret).join('********') : String(s));

const target = `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
console.log(`Checking PostgreSQL at ${target} …`);

process.env.DATABASE_URL = url;

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

try {
  const [{ one }] = await prisma.$queryRaw`SELECT 1 AS one`;
  if (one !== 1) throw new Error(`SELECT 1 returned ${one}`);

  const [{ version }] = await prisma.$queryRaw`SELECT version() AS version`;
  const [{ db, usr }] = await prisma.$queryRaw`SELECT current_database() AS db, current_user AS usr`;

  /* how many tables are already here — so a reset is never run blind against a
     database that turns out to hold somebody else's work */
  const [{ count }] = await prisma.$queryRaw`
    SELECT count(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

  console.log('  OK — SELECT 1 succeeded');
  console.log(`  server    ${String(version).split(' ').slice(0, 2).join(' ')}`);
  console.log(`  database  ${db}`);
  console.log(`  user      ${usr}`);
  console.log(`  tables    ${count} in the public schema`);
  await prisma.$disconnect();
  process.exit(0);
} catch (err) {
  console.error('  FAILED — PostgreSQL did not answer.\n');
  console.error('  Exact error:');
  for (const line of scrub(err.message).split('\n')) console.error(`    ${line}`);
  if (err.code) console.error(`    (code ${err.code})`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
