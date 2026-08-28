/* Clear the freshness bag and the rate-limit buckets before a browser run.
   The seen state is server-side and per user — which is the point of it — so a
   previous run leaves the tab already stamped and every "shows New" assertion
   fails while the feature works perfectly. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* resolved from this file, not the cwd — the harness runs it from elsewhere */
const ENV = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env');
const raw = readFileSync(ENV, 'utf8');
const kv = {};
for (const l of raw.split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l); if (m) kv[m[1]] = m[2].trim(); }
process.env.DATABASE_URL = kv.DATABASE_URL;

const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient({ log: [] });
const seen = await p.homeSeen.deleteMany({});
await p.$disconnect();

const { Redis } = await import('ioredis');
const r = new Redis(kv.REDIS_URL, { lazyConnect: true, connectTimeout: 10000 });
r.on('error', () => {});
await r.connect();
const keys = await r.keys('rl:*');
if (keys.length) await r.del(...keys);
r.disconnect();

console.log(`cleared ${seen.count} seen rows, ${keys.length} rate-limit keys`);
