import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as clientService from '../services/client.service.js';
import { loadScoper } from '../services/scope.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * Every handler resolves the caller's SCOPE first. The department a scope rule
 * needs is not in the token — it is on the user row — so it is loaded per
 * request rather than trusted from a claim that could be stale.
 */
export async function list(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientService.list(scoper, req.query as never));
}

export async function get(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientService.get(scoper, req.params.id as string));
}

export async function assignPodSeat(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(
    res,
    await clientService.assignPodSeat(
      scoper,
      req.params.id as string,
      req.params.pillarKey as string,
      req.body as never,
      req.ip,
    ),
  );
}
