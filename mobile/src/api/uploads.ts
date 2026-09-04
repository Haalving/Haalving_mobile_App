import { api } from './client';

/**
 * PUTTING A FILE IN THE VAULT, from the handset.
 *
 * Three steps and the bytes never touch our API: ask it to sign a URL, PUT the
 * file straight to Cloudflare R2, hand the key back to whoever needs to store it.
 * That is the only shape that works here — the API's JSON ceiling is 1 MB and a
 * phone camera JPEG is several times that — and it means a client on a weak
 * connection is retrying against Cloudflare rather than against us.
 *
 * THE KEY IS THE PRODUCT, not the URL. The signed URL dies in five minutes; the
 * key is what gets stored against the meal or the document, and it is a uuid this
 * client never chooses, so one person's plate cannot land on another's record.
 */

export type UploadFolder = 'meals' | 'documents';

export interface Signed {
  url: string;
  key: string;
  expiresIn: number;
  maxBytes: number;
}

/**
 * What React Native gives us for a picked file, whichever picker produced it.
 * `expo-image-picker` and `expo-document-picker` disagree about the field names,
 * so both are normalised to this before anything here touches them.
 */
export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
  bytes: number;
}

/** A readable size for a message a person sees. */
export function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Upload one file and return its key.
 *
 * `fetch` with the file's own `uri` as the body: React Native turns a `file://`
 * URI into a stream, so the whole image is never held in JS memory as a base64
 * string — which is what makes a 10 MB photo work on a mid-range Android.
 *
 * A FAILED PUT THROWS. R2 answers a bad signature or an oversized body with XML
 * and a 4xx, and `fetch` treats that as a perfectly good response; without the
 * check the caller would store a key for an object that was never written, and
 * the meal would carry a photo that 404s for ever.
 */
export async function uploadFile(folder: UploadFolder, file: PickedFile): Promise<string> {
  const signed = await api.post<Signed>('/client/uploads/sign', {
    folder,
    contentType: file.mime,
    bytes: file.bytes,
  });

  const res = await fetch(signed.url, {
    method: 'PUT',
    body: { uri: file.uri, type: file.mime, name: file.name } as unknown as BodyInit,
    headers: { 'Content-Type': file.mime },
  });

  if (!res.ok) {
    /* the two that actually happen, said in the client's words rather than R2's */
    if (res.status === 403) {
      throw new Error(`That file is too large (${mb(file.bytes)}). Try a smaller one.`);
    }
    throw new Error(`The upload did not go through (${res.status}). Try again.`);
  }

  return signed.key;
}
