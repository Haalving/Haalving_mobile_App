import type { Request, Response } from 'express';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { requireUser } from '../middleware/authenticate.js';
import * as attention from '../services/attention.service.js';
import { loadScoper } from '../services/scope.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * Attention. Parse, call the service, respond — no logic here.
 *
 * Every handler resolves the caller's SCOPE first, because the department a
 * scope rule needs sits on the user row rather than in the token, and a claim
 * minted fifteen minutes ago is not the place to read an access rule from.
 *
 * NOTHING IN THIS FILE DECIDES ANYTHING. Which tickets a caller may see, whether
 * a close is owed a reason, whether an assignment may name somebody else — all of
 * it is settled in `attention.service.ts`, because the 08:00 sweep raises tickets
 * through the same service and inherits none of a handler's checks.
 */

type ListQuery = z.infer<typeof schemas.listAttentionsQuery>;
type CreateInput = z.infer<typeof schemas.createAttentionSchema>;
type PatchInput = z.infer<typeof schemas.patchAttentionSchema>;

export async function list(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await attention.list(scoper, req.query as unknown as ListQuery));
}

/** The record's panel. The client is the PATH's, never the query's. */
export async function forClient(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(
    res,
    await attention.listForClient(scoper, req.params.id as string, req.query as unknown as ListQuery),
  );
}

/** 201, because a row is created — and the raiser is the token's, not the body's. */
export async function create(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return created(res, await attention.create(scoper, req.body as CreateInput));
}

export async function patch(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await attention.act(scoper, req.params.id as string, req.body as PatchInput));
}
