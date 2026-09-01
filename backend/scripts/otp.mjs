#!/usr/bin/env node
/**
 * WHAT IS THE ONE-TIME CODE, RIGHT NOW.
 *
 * Development only. `SMS_PROVIDER=console` writes each code to the API's terminal
 * (`utils/otp.ts`), and `env.ts` refuses to boot production with that setting — so
 * there is no environment where this reads a code that a real person was sent.
 *
 * WHY THIS EXISTS RATHER THAN "GREP THE LOG". The log and the database are two
 * sources, and reading the code from one while reading its freshness from the other
 * is a race that looks exactly like success. It bit us: a second `otp/request`
 * landed between the two reads, `requestOtp` consumed the previous row on its way
 * past, and the answer paired a code from the old row with the countdown from the
 * new one. Every field printed below comes from ONE row, so a code and its
 * expiry can never describe different codes.
 *
 * HOW IT READS THE CODE. `otps.codeHash` is `sha256(phone:code)` and there is
 * nothing to reverse, so the six-digit space is walked until the hash matches. That
 * is not a weakness being exploited: `utils/otp.ts` says in its own comment that a
 * million values are brute-forceable offline and that expiry plus the attempt
 * counter are what actually protect the code. This runs against a local
 * development database, on codes the same machine just printed to its own terminal.
 *
 * IT SPENDS NO ATTEMPTS. Reading the row is not verifying it, so checking a code
 * never moves it closer to the five-guess ceiling — which calling
 * `/auth/client/otp/verify` to "test" a code would.
 *
 * USAGE
 *   node backend/scripts/otp.mjs                    # the live code for both personas
 *   node backend/scripts/otp.mjs --new              # request fresh ones first
 *   node backend/scripts/otp.mjs +919847022110      # one number
 *   node backend/scripts/otp.mjs --new +919...      # request and read that one
 */
import { createHash } from 'node:crypto';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();

const API = process.env.OTP_API_URL ?? 'http://localhost:4001/api/v1';

/** The two seeded personas the pixel harness drives. */
const DEFAULTS = [
  { phone: '+919847022110', who: 'Rajesh D. — Poorna, human pillars' },
  { phone: '+919400126834', who: 'Ananya S. — Svayam, AI end to end' },
];

const hash = (code, phone) => createHash('sha256').update(`${phone}:${code}`).digest('hex');

/** Walk the six-digit space until the stored hash matches. ~1M sha256, well under a second. */
function recover(codeHash, phone) {
  for (let i = 0; i < 1_000_000; i++) {
    const code = String(i).padStart(6, '0');
    if (hash(code, phone) === codeHash) return code;
  }
  return null;
}

async function requestFresh(phone) {
  const res = await fetch(`${API}/auth/client/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Client': 'mobile' },
    body: JSON.stringify({ phone }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(json?.error?.message ?? `request answered ${res.status}`);
}

const args = process.argv.slice(2);
const fresh = args.includes('--new');
const asked = args.filter((a) => !a.startsWith('--'));
const targets = asked.length ? asked.map((phone) => ({ phone, who: '' })) : DEFAULTS;

const prisma = new PrismaClient();
let exitCode = 0;

for (const { phone, who } of targets) {
  if (fresh) {
    try {
      await requestFresh(phone);
    } catch (err) {
      console.log(`${phone}  could not request — ${err.message}`);
      exitCode = 1;
      continue;
    }
  }

  /*
   * The LATEST row is the only live one. `requestOtp` consumes every earlier row
   * for the number before it creates a new one, so an older code is dead the
   * moment another is asked for — which is precisely the failure this script was
   * written to stop reporting as "still valid".
   */
  const row = await prisma.otp.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
    select: { phone: true, codeHash: true, createdAt: true, expiresAt: true, consumedAt: true, attempts: true },
  });

  if (!row) {
    console.log(`${phone}  no code has been requested — run with --new`);
    exitCode = 1;
    continue;
  }

  const left = Math.round((row.expiresAt.getTime() - Date.now()) / 1000);
  const code = recover(row.codeHash, row.phone);
  const dead = row.consumedAt ? 'ALREADY USED' : left <= 0 ? 'EXPIRED' : null;

  const label = who ? `  (${who})` : '';
  if (dead) {
    console.log(`${phone}  ${code ?? '??????'}  — ${dead}, ask for a new one: --new${label}`);
    exitCode = 1;
  } else {
    console.log(`${phone}  ${code}  — ${left}s left, ${5 - row.attempts} guesses remain${label}`);
  }
}

await prisma.$disconnect();
process.exit(exitCode);
