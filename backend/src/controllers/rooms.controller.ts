import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as rooms from '../services/rooms.service.js';
import { loadScoper } from '../services/scope.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * The chat tray — every room the caller is part of, newest word first. The
 * caller is the token; there is nothing to parse.
 */
export async function list(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await rooms.list(scoper));
}
