import type { Request, Response } from 'express';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { requireUser } from '../middleware/authenticate.js';
import * as podNotes from '../services/podnote.service.js';
import { loadScoper } from '../services/scope.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * Pod notes. Parse, call the service, respond — no logic here.
 *
 * NOTHING IN THIS FILE DECIDES ANYTHING, and on this resource that matters more
 * than usual: whether the caller is staff at all, whether their scope reaches the
 * client, and whether an edit is theirs to make are settled in
 * `podnote.service.ts`, because a check written into a handler is a check the
 * next caller of the service does not inherit.
 */

type CreateInput = z.infer<typeof schemas.createPodNoteSchema>;
type UpdateInput = z.infer<typeof schemas.updatePodNoteSchema>;

export async function list(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await podNotes.list(scoper, req.params.id as string));
}

export async function create(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const note = await podNotes.create(scoper, req.params.id as string, req.body as CreateInput, req.ip);
  return created(res, note);
}

export async function update(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(
    res,
    await podNotes.update(
      scoper,
      req.params.id as string,
      req.params.noteId as string,
      req.body as UpdateInput,
      req.ip,
    ),
  );
}

export async function remove(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(
    res,
    await podNotes.remove(scoper, req.params.id as string, req.params.noteId as string, req.ip),
  );
}
