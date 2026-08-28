/**
 * Does the Redis named in REDIS_URL answer?
 *
 *   node backend/scripts/check-redis.mjs
 *   pnpm --filter @haalving/backend check:redis
 *
 * It sends PING through ioredis — the same client the API uses.
 *
 * NOTHING SECRET IS EVER PRINTED. Host and port are reported so a failure can be
 * acted on; user and password never are, and error text is scrubbed of the
 * password before it is shown. Errors are otherwise printed VERBATIM.
 *
 * It gives up quickly and deliberately: `retryStrategy: null` and a short command
 * timeout mean an unreachable host fails in about a second rather than retrying
 * silently for a minute. A connectivity CHECK that hangs has answered nothing.
 *
 * Exit 0 = reachable. Exit 1 = not.
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
const url = env.REDIS_URL;

if (!url) {
  console.error('REDIS_URL is not set in backend/.env.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch (err) {
  console.error(`REDIS_URL is not a valid URL: ${err.message}`);
  process.exit(1);
}

const secret = parsed.password;
const scrub = (s) => (secret ? String(s).split(secret).join('********') : String(s));

const tls = parsed.protocol === 'rediss:';
console.log(`Checking Redis at ${parsed.hostname}:${parsed.port || 6379}${tls ? ' (TLS)' : ''} …`);

const { Redis } = await import('ioredis');

const redis = new Redis(url, {
  /* fail FAST: this is a check, and one that retries for a minute has told the
     caller nothing they can act on */
  retryStrategy: null,
  maxRetriesPerRequest: 1,
  connectTimeout: 5_000,
  commandTimeout: 5_000,
  enableOfflineQueue: false,
  lazyConnect: true,
});

/* ioredis emits `error` as an event; without a listener Node treats it as an
   unhandled exception and the process dies before the catch below can report. */
let firstError = null;
redis.on('error', (err) => {
  if (!firstError) firstError = err;
});

try {
  await redis.connect();
  const pong = await redis.ping();
  if (pong !== 'PONG') throw new Error(`PING returned ${pong}`);

  let version = 'unknown';
  try {
    const info = await redis.info('server');
    version = /redis_version:(\S+)/.exec(info)?.[1] ?? 'unknown';
  } catch {
    /* a managed Redis may refuse INFO; PING succeeding is what we came for */
  }

  console.log('  OK — PING returned PONG');
  console.log(`  server    Redis ${version}`);
  redis.disconnect();
  process.exit(0);
} catch (err) {
  const real = firstError ?? err;
  console.error('  FAILED — Redis did not answer.\n');
  console.error('  Exact error:');
  for (const line of scrub(real.message).split('\n')) console.error(`    ${line}`);
  if (real.code) console.error(`    (code ${real.code})`);
  redis.disconnect();
  process.exit(1);
}
