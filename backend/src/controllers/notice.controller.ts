import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as notices from '../services/notice.service.js';
import { loadScoper } from '../services/scope.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * Home › Notices. Parse, call the service, respond — no logic here.
 *
 * THE CALLER IS THE RECIPIENT, always, taken from the token and never from the
 * query or the body. There is deliberately no `toId` anywhere below: an outbox
 * that could be asked for by id is not an outbox, it is somebody else's post.
 */

export async function list(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await notices.list(scoper, req.query as unknown as notices.ListNoticesInput));
}

export async function unreadCount(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await notices.unreadCount(scoper));
}

export async function markRead(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { id } = req.params as { id: string };
  return ok(res, await notices.markRead(scoper, id));
}

export async function acknowledge(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { id } = req.params as { id: string };
  return ok(res, await notices.acknowledge(scoper, id));
}
