import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as digest from '../services/digest.service.js';
import { loadScoper } from '../services/scope.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * Home's digest tabs. Parse, call the service, respond — no logic here.
 *
 * Every handler resolves the caller's SCOPE first: the department a scope rule
 * needs is on the user row, not in the token, so it is loaded per request rather
 * than trusted from a claim that could be stale.
 */

export async function attention(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await digest.listAttention(scoper));
}

export async function markSeen(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { tab, ids } = req.body as { tab: digest.SeenTab; ids: string[] };
  return ok(res, await digest.markSeen(scoper, tab, ids));
}

export async function notices(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await digest.listNotices(scoper));
}

export async function markNoticesSeen(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await digest.markNoticesSeen(scoper));
}
