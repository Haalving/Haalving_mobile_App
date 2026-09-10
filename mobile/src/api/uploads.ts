import { Platform } from 'react-native';

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
/**
 * The bytes to PUT, in the one form each platform can actually send.
 *
 * NATIVE gets the `{uri, type, name}` object. That is not a general `fetch`
 * body — it is React Native's own convention, and its whole point is that RN
 * turns a `file://` URI into a STREAM, so a 10 MB photo is never held in JS
 * memory as a base64 string. That is what makes this work on a mid-range
 * Android.
 *
 * WEB GETS A REAL BLOB, because that object means nothing to a browser: the
 * browser has no `file://` streaming convention, so `fetch` stringifies it and
 * PUTs the fifteen bytes `[object Object]`. R2 accepts that happily — the
 * upload "succeeds", the key is stored, and the meal carries a photo that is
 * not an image. A silent corruption is worse than a failure, which is why this
 * split exists rather than a note in the README.
 *
 * On web the picker hands back a `blob:` or `data:` URL, and fetching it is how
 * you get the bytes back out of it.
 */
async function bodyFor(file: PickedFile): Promise<BodyInit> {
  if (Platform.OS !== 'web') {
    return { uri: file.uri, type: file.mime, name: file.name } as unknown as BodyInit;
  }
  const local = await fetch(file.uri);
  return await local.blob();
}

/**
 * Upload one file and return its key.
 *
 * A FAILED PUT THROWS. R2 answers a bad signature or an oversized body with XML
 * and a 4xx, and `fetch` treats that as a perfectly good response; without the
 * check the caller would store a key for an object that was never written, and
 * the meal would carry a photo that 404s for ever.
 *
 * A BLOCKED PUT THROWS SOMETHING A PERSON CAN ACT ON. A browser refused by CORS
 * never gets a response at all — `fetch` rejects with a bare "Failed to fetch"
 * and no status, which tells the client nothing and tells whoever reads the bug
 * report even less. R2 buckets ship with NO CORS policy, so this is the default
 * state of a fresh bucket rather than an exotic failure: the web build of this
 * app cannot upload anything until the bucket allows its origin. The message
 * below names that, because the alternative is a client who believes their
 * photo went through.
 */
export async function uploadFile(folder: UploadFolder, file: PickedFile): Promise<string> {
  const body = await bodyFor(file);

  /*
   * A SIZE THE SERVER WILL ACCEPT, even when the picker did not supply one.
   *
   * `expo-image-picker` does not always populate `fileSize`, and both call sites
   * fall back to `0` — which `/client/uploads/sign` rejects outright, because
   * its schema asks for a positive integer. The upload then failed before it
   * began, and the client logged the plate with no photograph.
   *
   * A Blob knows its own length, so on web there is nothing to guess. On native
   * the body is a stream by design and cannot be measured without reading it, so
   * an unknown size is declared as one byte: the number is now only a pre-check
   * (the PUT does not sign it, and `captureMeal` checks the stored object), and
   * under-declaring cannot buy anything — the real bytes are measured on attach.
   */
  const declared =
    file.bytes > 0 ? file.bytes : body instanceof Blob && body.size > 0 ? body.size : 1;

  const signed = await api.post<Signed>('/client/uploads/sign', {
    folder,
    contentType: file.mime,
    bytes: declared,
  });

  let res: Response;
  try {
    res = await fetch(signed.url, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': file.mime },
    });
  } catch {
    /* no status to read: the request never left the browser */
    throw new Error(
      Platform.OS === 'web'
        ? 'The upload was blocked by the browser. Storage is not accepting uploads from this address yet — try the phone app.'
        : 'The upload could not reach storage. Check your connection and try again.',
    );
  }

  if (!res.ok) {
    /*
     * 403 NO LONGER MEANS "TOO LARGE", and saying so was the misdiagnosis that
     * hid this bug for a build. R2 answers 403 for any signature it will not
     * accept; while the PUT signed a predicted content-length, every photograph
     * whose real size differed from the picker's guess landed here and told the
     * client their file was too big. It was not — the size limit is checked when
     * the key is attached, and it says so in its own words.
     */
    if (res.status === 403) {
      throw new Error('Storage refused the upload — the link may have expired. Try again.');
    }
    throw new Error(`The upload did not go through (${res.status}). Try again.`);
  }

  return signed.key;
}
