import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as people from '../services/people.service.js';
import * as roleService from '../services/role.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * People & Access. Parse, call the service, respond — no logic here.
 *
 * The staff LIST is served by `user.controller.ts` as it has been since Day 1;
 * what lives here is everything that page grew afterwards — the derived-tag read,
 * deactivation, the capacity tab, the roles matrix and the team feed.
 */

const actor = (req: Request) => {
  const u = requireUser(req);
  return { id: u.id, role: u.role };
};

const ip = (req: Request) => req.ip ?? undefined;

/* -------------------------------------------------------------- staff */

export async function listStaff(req: Request, res: Response) {
  return ok(res, await people.listStaff(actor(req)));
}

export async function getStaff(req: Request, res: Response) {
  return ok(res, await people.getStaff(actor(req), req.params.id as string));
}

export async function headcount(req: Request, res: Response) {
  return ok(res, await people.headcount(actor(req)));
}

export async function deactivate(req: Request, res: Response) {
  return ok(res, await people.deactivate(actor(req), req.params.id as string, ip(req)));
}

export async function reactivate(req: Request, res: Response) {
  return ok(res, await people.reactivate(actor(req), req.params.id as string, ip(req)));
}

/* ------------------------------------------------------------- roles */

export async function listRoles(_req: Request, res: Response) {
  const [rows, counts] = await Promise.all([roleService.list(), roleService.headcounts()]);
  return ok(
    res,
    rows.map((r) => ({ ...r, headcount: counts[r.key] ?? 0 })),
  );
}

export async function toggleNav(req: Request, res: Response) {
  const { navId, on } = req.body as { navId: string; on: boolean };
  const a = actor(req);
  return ok(res, await roleService.toggleNav(req.params.key as string, navId, on, a.id, ip(req)));
}

export async function togglePerm(req: Request, res: Response) {
  const { perm, on } = req.body as { perm: string; on: boolean };
  const a = actor(req);
  return ok(res, await roleService.togglePerm(req.params.key as string, perm, on, a.id, ip(req)));
}

export async function createRole(req: Request, res: Response) {
  const { title, baseKey } = req.body as { title: string; baseKey: string };
  const a = actor(req);
  return created(res, await roleService.createRole(title, baseKey, a.id, ip(req)));
}

/* ---------------------------------------------------------- capacity */

export async function listCapacity(_req: Request, res: Response) {
  return ok(res, await people.listCapacity());
}

export async function setCap(req: Request, res: Response) {
  const { cap } = req.body as { cap: number };
  return ok(res, await people.setCap(actor(req), req.params.staffId as string, cap, ip(req)));
}

/* -------------------------------------------------------------- feed */

export async function listFeed(req: Request, res: Response) {
  return ok(res, await people.listFeed(actor(req)));
}

export async function post(req: Request, res: Response) {
  return created(res, await people.post(actor(req), req.body as never, ip(req)));
}

export async function markSeen(req: Request, res: Response) {
  return ok(res, await people.markFeedSeen(actor(req)));
}
