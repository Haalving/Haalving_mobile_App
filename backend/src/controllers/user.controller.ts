import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as capacityService from '../services/capacity.service.js';
import * as userService from '../services/user.service.js';
import { created, ok } from '../utils/apiResponse.js';

export async function list(req: Request, res: Response) {
  return ok(res, await userService.list(req.query as never));
}

export async function get(req: Request, res: Response) {
  return ok(res, await userService.get(req.params.id as string));
}

export async function create(req: Request, res: Response) {
  const me = requireUser(req);
  return created(res, await userService.create(req.body as never, me.id, req.ip));
}

export async function update(req: Request, res: Response) {
  const me = requireUser(req);
  return ok(res, await userService.update(req.params.id as string, req.body as never, me.id, req.ip));
}

export async function changeRole(req: Request, res: Response) {
  const me = requireUser(req);
  return ok(res, await userService.changeRole(req.params.id as string, req.body as never, me.id, req.ip));
}

export async function updateAvailability(req: Request, res: Response) {
  const me = requireUser(req);
  const { avail } = req.body as { avail: never };
  return ok(res, await userService.updateAvailability(req.params.id as string, avail, me.id, req.ip));
}

export async function updateCapacity(req: Request, res: Response) {
  const me = requireUser(req);
  const body = req.body as { declared: number; load?: number; note?: string | null; reason?: string };
  return ok(
    res,
    await capacityService.update(
      req.params.id as string,
      body,
      { id: me.id, role: me.role },
      { ...(body.reason ? { reason: body.reason } : {}), ...(req.ip ? { ip: req.ip } : {}) },
    ),
  );
}
