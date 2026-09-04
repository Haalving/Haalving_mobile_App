/**
 * DOES OBJECT STORAGE ACTUALLY WORK?
 *
 *   pnpm --filter @haalving/backend r2:check
 *
 * Runs the whole round trip against the real bucket — reach it, write an object,
 * read it back, confirm the bytes match, then delete it — because each step fails
 * for a different reason and a single "connected" answer would hide which one.
 * Most misconfigurations pass the first step and fail the second: a token scoped
 * to read cannot write, and that is invisible until something tries.
 *
 * It cleans up after itself. If it dies mid-way the probe object is left behind
 * under `_healthcheck/`, which is why it is prefixed rather than scattered.
 */
import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import 'dotenv/config';

const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
const missing = need.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(`\n  Not configured. Missing: ${missing.join(', ')}\n`);
  if (missing.includes('R2_ACCOUNT_ID')) {
    console.error(
      '  R2_ACCOUNT_ID is the subdomain in the endpoint Cloudflare shows you:\n' +
        '    https://<THIS-PART>.r2.cloudflarestorage.com\n' +
        '  R2 → Overview, or the account id on the right of any Cloudflare page.\n',
    );
  }
  process.exit(1);
}

const bucket = process.env.R2_BUCKET;
const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const key = `_healthcheck/${randomUUID()}.txt`;
const body = `haalving r2 probe ${new Date().toISOString()}`;

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

console.log(`\n  endpoint  ${endpoint}`);
console.log(`  bucket    ${bucket}\n`);

const step = async (label, fn) => {
  try {
    /* only a STRING is worth printing — the AWS commands resolve to a response
       object, and interpolating that gave every line a "[object Object]" tail */
    const extra = await fn();
    console.log(`  ok    ${label}${typeof extra === 'string' ? ` — ${extra}` : ''}`);
    return true;
  } catch (e) {
    console.log(`  FAIL  ${label}`);
    console.log(`        ${e.name}: ${e.message}`);
    /* the three that actually happen, each with the thing to go and change */
    if (e.name === 'NoSuchBucket') {
      console.log(`        No bucket called "${bucket}" in this account. Check R2_BUCKET,`);
      console.log('        and that R2_ACCOUNT_ID is the account the bucket lives in.');
    }
    if (/SignatureDoesNotMatch|InvalidAccessKeyId/.test(e.name + e.message)) {
      console.log('        The key pair is wrong, or belongs to another account.');
    }
    if (/AccessDenied/.test(e.name + e.message)) {
      console.log('        The token reached R2 but is not permitted to do this —');
      console.log('        it likely needs Object Read & Write rather than read only.');
    }
    if (/ENOTFOUND|EAI_AGAIN/.test(e.message)) {
      console.log('        That hostname does not resolve — R2_ACCOUNT_ID looks wrong.');
    }
    return false;
  }
};

let ok = true;
ok = (await step('reach the bucket', () => s3.send(new HeadBucketCommand({ Bucket: bucket })))) && ok;

if (ok) {
  ok =
    (await step('write an object', () =>
      s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }),
      ),
    )) && ok;
}

if (ok) {
  ok =
    (await step('read it back', async () => {
      const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const text = await got.Body.transformToString();
      if (text !== body) throw new Error('the bytes came back different');
      return `${text.length} bytes matched`;
    })) && ok;
}

if (ok) {
  ok = (await step('delete it', () => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })))) && ok;
}

console.log(
  ok
    ? '\n  R2 is working — uploads, downloads and deletes all succeeded.\n'
    : '\n  R2 is NOT usable yet. Fix the first FAIL above; the later steps depend on it.\n',
);
process.exit(ok ? 0 : 1);
