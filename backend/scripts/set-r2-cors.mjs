import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Put the CORS policy on the R2 bucket.
 *
 * WHY THIS EXISTS AT ALL. An R2 bucket ships with NO CORS configuration, and a
 * bucket with no CORS refuses every cross-origin request a BROWSER makes —
 * before the request leaves the machine, so there is no status code and no
 * server log, only `TypeError: Failed to fetch` in the console. Native iOS and
 * Android are unaffected (there is no origin to check), which is exactly what
 * makes this so confusing to diagnose: the phone app uploads photographs
 * perfectly while the web build cannot upload anything at all, against the same
 * bucket, with the same signed URL.
 *
 * WHAT NEEDS THE POLICY. `mobile/src/api/uploads.ts` PUTs the file straight to
 * R2 from the client — meal photographs and client documents. On the web build
 * that is a cross-origin PUT with a `Content-Type` header, which is not a
 * "simple request", so the browser sends a preflight OPTIONS first and R2 must
 * answer it.
 *
 * THE CREDENTIALS IN `.env` ARE PROBABLY NOT ENOUGH. An R2 API token scoped to
 * Object Read & Write can put and get objects all day and still gets
 * `AccessDenied` here, because bucket CONFIGURATION is a different permission.
 * If this script refuses, that is why — see the message it prints.
 */

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, 'r2-cors.json'), 'utf8'));

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('R2 is not configured in backend/.env — nothing to do.');
  process.exit(1);
}

/* extra origins without editing the JSON: `node set-r2-cors.mjs https://app.example.com` */
const extra = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
if (extra.length) rules[0].AllowedOrigins.push(...extra);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

console.log(`bucket   ${R2_BUCKET}`);
console.log(`origins  ${rules[0].AllowedOrigins.join(', ')}\n`);

try {
  await s3.send(
    new PutBucketCorsCommand({ Bucket: R2_BUCKET, CORSConfiguration: { CORSRules: rules } }),
  );
  const back = await s3.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
  console.log('CORS applied. The bucket now reports:\n');
  console.log(JSON.stringify(back.CORSRules, null, 2));
} catch (e) {
  if (e.name === 'AccessDenied') {
    console.error('AccessDenied — this R2 token cannot change bucket configuration.\n');
    console.error('Set it by hand instead (about a minute):');
    console.error('  Cloudflare dashboard → R2 → ' + R2_BUCKET + ' → Settings → CORS Policy → Edit');
    console.error('and paste the contents of backend/scripts/r2-cors.json.\n');
    console.error('Add your production origin to that list before going live.');
    process.exit(2);
  }
  console.error(`${e.name}: ${e.message}`);
  process.exit(1);
}
