import type { Request, Response } from 'express';

import * as storage from '../services/storage.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * UPLOADS — the two signatures, and the status.
 *
 * The API never carries the bytes. It says "here is a URL, PUT the file there",
 * and the browser talks to R2 directly; see `storage.service.ts` for why.
 */

export async function sign(req: Request, res: Response) {
  const body = req.body as { folder: storage.UploadFolder; contentType: string; bytes: number };
  return ok(res, await storage.signUpload(body));
}

export async function signDownload(req: Request, res: Response) {
  const body = req.body as { key: string; name?: string };
  return ok(res, { url: await storage.signDownload(body.key, body.name) });
}

/**
 * Is storage working, from the API's own point of view?
 *
 * Reachability is a live question — a token can be revoked while the process
 * keeps running — so this asks R2 rather than reading the .env back.
 */
export async function status(_req: Request, res: Response) {
  return ok(res, await storage.check());
}
