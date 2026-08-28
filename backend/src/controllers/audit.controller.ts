import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as auditService from '../services/audit.service.js';
import { ok } from '../utils/apiResponse.js';

export async function list(req: Request, res: Response) {
  const q = req.query as unknown as auditService.ListAuditQuery;
  return ok(res, await auditService.list(q));
}

/**
 * The console's edge middleware reports a blocked NAVIGATION here.
 *
 * A page the sidebar does not carry never reaches the API at all, so the server
 * would otherwise never learn the attempt happened — and the demo's lock screen
 * promises, in as many words, that it was logged.
 *
 * This is deliberately NOT a general-purpose audit writer. The action is fixed to
 * `denied` and the actor is taken from the token, never the body: an endpoint
 * that let a caller choose either would let anyone forge the trail that is meant
 * to hold them to account.
 */
export async function recordDenied(req: Request, res: Response) {
  const me = requireUser(req);
  const { path, view } = req.body as { path: string; view?: string };

  await auditService.record({
    actorId: me.id,
    action: 'denied',
    subjectType: 'access',
    subjectId: view ?? path,
    reason: `Blocked: ${path}`,
    meta: { path, view: view ?? null, role: me.role, via: 'web-middleware' },
    ip: req.ip ?? null,
  });

  return ok(res, { logged: true });
}
