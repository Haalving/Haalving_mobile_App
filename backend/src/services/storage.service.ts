import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../config/env.js';
import { ApiError } from '../utils/apiResponse.js';

/**
 * OBJECT STORAGE — Cloudflare R2.
 *
 * Every file a person uploads (a CV, a lab report, an InBody scan) lives here and
 * never in the database or on the API's disk. Two reasons, and both are about the
 * files being somebody's medical records rather than about size: a container that
 * holds state cannot be replaced without losing it, and a row that holds a PDF is
 * a row that gets copied into every backup and every read of the table beside it.
 *
 * THE BYTES NEVER PASS THROUGH THIS SERVICE. The browser is handed a presigned URL
 * and talks to R2 directly, which is why `express.json` can keep its 1 MB ceiling
 * (`app.ts`) while a 20 MB scan still uploads. It also means an upload that fails
 * halfway leaves nothing here to clean up.
 *
 * R2 SPEAKS S3, with two departures worth knowing:
 *   - the region is always `auto`; R2 has no regions and rejects a real one.
 *   - the endpoint is per ACCOUNT (`https://<account-id>.r2.cloudflarestorage.com`),
 *     not per region, and the account id is the one value that cannot be guessed
 *     from the credentials — which is why `configured()` demands it by name.
 *
 * THE KEY IS A UUID, never the filename. `User.cv` stores the key and `cvName` the
 * name a human recognises, and the schema says why: "an R2 key is a uuid and
 * 'Vikram-CV-2026.pdf' is not". A key built from a filename lets one upload
 * overwrite another's, and lets a caller guess a colleague's.
 */

/** Where uploads are filed. A prefix per kind, so a bucket listing is readable. */
export type UploadFolder = 'cv' | 'documents' | 'avatars' | 'meals';

/**
 * The folders a CLIENT may write to from the phone.
 *
 * A narrower list than the staff one on purpose: a client photographs plates and
 * uploads their own reports, and has no business writing into `cv`. Enumerated
 * here rather than checked at the route, so a second client route cannot be added
 * later that quietly widens it.
 */
export const CLIENT_FOLDERS = ['meals', 'documents'] as const satisfies readonly UploadFolder[];

/** The types we will sign for. Anything else is refused before a URL is minted. */
const ALLOWED: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
};

/**
 * The ceiling a presigned PUT is minted with, per folder.
 *
 * Signed INTO the URL as a content-length range, so it is enforced by R2 rather
 * than by us — a limit the client is merely asked to respect is not a limit.
 */
const MAX_BYTES: Record<UploadFolder, number> = {
  cv: 10 * 1024 * 1024,
  documents: 25 * 1024 * 1024,
  avatars: 5 * 1024 * 1024,
  /* a phone camera JPEG, not a raw. Generous enough for a modern sensor and small
     enough that a client on hotel wifi is not uploading for two minutes. */
  meals: 12 * 1024 * 1024,
};

/** Minutes a signed URL stays good. Short: it is handed over and used at once. */
const PUT_TTL_S = 5 * 60;
const GET_TTL_S = 10 * 60;

/**
 * Is object storage actually set up?
 *
 * Every value is checked, because a half-filled .env is the common case and the
 * failure it produces otherwise is a signature error from R2 that names nothing.
 * The account id is called out separately: the endpoint Cloudflare shows you in
 * the dashboard carries a `<account-id>` placeholder, and pasting it verbatim is
 * the single most likely way to arrive here misconfigured.
 */
export function configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
}

/** What is missing, named — so a 503 can say which key to fill rather than "storage off". */
export function missingKeys(): string[] {
  const out: string[] = [];
  if (!env.R2_ACCOUNT_ID) out.push('R2_ACCOUNT_ID');
  if (!env.R2_ACCESS_KEY_ID) out.push('R2_ACCESS_KEY_ID');
  if (!env.R2_SECRET_ACCESS_KEY) out.push('R2_SECRET_ACCESS_KEY');
  if (!env.R2_BUCKET) out.push('R2_BUCKET');
  return out;
}

export function endpoint(): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

let client: S3Client | null = null;

/**
 * One client, built on first use rather than at import.
 *
 * At import it would be constructed in every test run and on every box that has
 * no storage configured, and the tests do not have credentials — a module that
 * throws on import takes the whole app down with it.
 */
function s3(): S3Client {
  if (!configured()) {
    throw ApiError.unavailable(
      `Object storage is not configured — set ${missingKeys().join(', ')}.`,
    );
  }
  client ??= new S3Client({
    /* R2 has no regions. 'auto' is the only value it accepts. */
    region: 'auto',
    endpoint: endpoint(),
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

/** Drop the cached client — tests and a credential change both need this. */
export function reset(): void {
  client = null;
}

/**
 * A fresh key: `<folder>/<uuid><ext>`.
 *
 * The extension is kept ONLY because some viewers pick a renderer from it; it is
 * taken from the allow-list for the declared content type, never from the name
 * the caller sent, so `report.pdf.exe` cannot become the key.
 */
export function newKey(folder: UploadFolder, contentType: string): string {
  const exts = ALLOWED[contentType];
  if (!exts) throw ApiError.badRequest(`Files of type ${contentType} are not accepted.`);
  return `${folder}/${randomUUID()}${exts[0]}`;
}

/** Refuse anything we will not sign for, with the reason a person can act on. */
export function assertUploadable(folder: UploadFolder, contentType: string, bytes: number): void {
  if (!ALLOWED[contentType]) {
    throw ApiError.badRequest(
      `That file type is not accepted. Send a PDF or an image (${Object.keys(ALLOWED)
        .map((t) => t.split('/')[1])
        .join(', ')}).`,
    );
  }
  const max = MAX_BYTES[folder];
  if (bytes > max) {
    throw ApiError.badRequest(
      `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB — the limit here is ${max / 1024 / 1024} MB.`,
    );
  }
}

/**
 * A URL the browser can PUT one file to, and the key that file will have.
 *
 * The key is returned WITH the URL rather than read back afterwards, because the
 * caller has to store it against the row (a staff member's `cv`) and there is no
 * listing that could tell you afterwards which of a thousand uuids was theirs.
 */
export async function signUpload(args: {
  folder: UploadFolder;
  contentType: string;
  bytes: number;
}): Promise<{ url: string; key: string; expiresIn: number; maxBytes: number }> {
  assertUploadable(args.folder, args.contentType, args.bytes);
  const key = newKey(args.folder, args.contentType);

  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: args.contentType,
      ContentLength: args.bytes,
    }),
    { expiresIn: PUT_TTL_S },
  );

  return { url, key, expiresIn: PUT_TTL_S, maxBytes: MAX_BYTES[args.folder] };
}

/**
 * A URL to read one object back.
 *
 * SIGNED, not public, even when `R2_PUBLIC_URL` is set: these are lab reports and
 * CVs, and a bucket served publicly means a leaked key is a permanent disclosure.
 * `downloadAs` sets the filename the browser saves it under, which is the whole
 * reason `cvName` is stored beside the key.
 */
export async function signDownload(key: string, downloadAs?: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ...(downloadAs
        ? {
            ResponseContentDisposition: `attachment; filename="${downloadAs.replace(/["\\]/g, '')}"`,
          }
        : {}),
    }),
    { expiresIn: GET_TTL_S },
  );
}

/** Did the upload actually land? Called before a key is stored against a row. */
export async function exists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Remove one object. Best-effort: a row cleared with the file left behind is
    recoverable, a row pointing at a deleted file is not. */
export async function remove(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

/**
 * Can we actually reach the bucket with these credentials?
 *
 * Used by the health probe and by `scripts/check-r2.mjs`. Returns rather than
 * throws, because "storage is down" is a fact a status endpoint reports, not an
 * error that should take a request with it.
 */
export async function check(): Promise<{ ok: boolean; bucket: string; detail: string }> {
  if (!configured()) {
    return { ok: false, bucket: env.R2_BUCKET, detail: `not configured: ${missingKeys().join(', ')}` };
  }
  try {
    await s3().send(new HeadBucketCommand({ Bucket: env.R2_BUCKET }));
    return { ok: true, bucket: env.R2_BUCKET, detail: 'reachable' };
  } catch (e) {
    return { ok: false, bucket: env.R2_BUCKET, detail: (e as Error).message };
  }
}

/**
 * IS THIS AN OBJECT WE STORE, or a path the seed shipped?
 *
 * `Meal.photo` holds one of two things: a demo path (`img/dishes/idli.webp`,
 * served straight off this API by `app.ts`) or an R2 key written by a phone
 * (`meals/<uuid>.jpg`). The distinction is the folder prefix, and every read path
 * needs it — a signed URL for a seeded path would 404, and a bare R2 key handed
 * to an <img> would resolve against the console's own origin.
 */
export function isStoredObject(value: string | null | undefined): boolean {
  if (!value) return false;
  return (['cv', 'documents', 'avatars', 'meals'] as const).some((f) => value.startsWith(`${f}/`));
}

/**
 * What a screen should actually load for a stored value.
 *
 * Returns the value untouched when it is a seeded path, a signed URL when it is
 * an R2 key, and null when storage is not configured — the caller then renders
 * its "no photo" state rather than a broken image.
 */
export async function displayUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!isStoredObject(value)) return value;
  if (!configured()) return null;
  return signDownload(value);
}

/** The extension for a content type, for callers building a display name. */
export function extensionFor(contentType: string): string {
  return ALLOWED[contentType]?.[0] ?? '';
}
