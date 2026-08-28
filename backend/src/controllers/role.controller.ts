import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as roleService from '../services/role.service.js';
import { ok } from '../utils/apiResponse.js';

export async function list(_req: Request, res: Response) {
  return ok(res, await roleService.list());
}

export async function update(req: Request, res: Response) {
  const me = requireUser(req);
  return ok(res, await roleService.update(req.params.key as string, req.body as never, me.id, req.ip));
}
