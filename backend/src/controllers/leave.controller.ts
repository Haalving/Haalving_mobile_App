import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { prisma } from '../config/prisma.js';
import * as leave from '../services/leave.service.js';
import * as audit from '../services/audit.service.js';
import { ApiError, created, ok } from '../utils/apiResponse.js';

/** Time & Cover. Parse, call the service, respond — no logic here. */

const actor = (req: Request) => {
  const u = requireUser(req);
  return { id: u.id, role: u.role };
};

/* ------------------------------------------------------- availability */

export async function getMyAvailability(req: Request, res: Response) {
  const me = await prisma.user.findUnique({
    where: { id: actor(req).id },
    select: { avail: true, tz: true, tzLabel: true, tzo: true },
  });
  return ok(res, me);
}

/**
 * A week belongs to the person who works it.
 *
 * `managePeople` may edit somebody else's — People & Access shows it read-only and
 * says so — but nobody else can, because a working week that a colleague could
 * rewrite is not a declaration, it is a suggestion.
 */
export async function putAvailability(req: Request, res: Response) {
  const a = actor(req);
  const target = (req.params.staffId as string | undefined) ?? a.id;

  if (target !== a.id && !(await can(a.role, 'managePeople'))) {
    await audit.record({
      actorId: a.id,
      action: 'denied',
      subjectType: 'availability',
      subjectId: target,
      reason: 'availability.write',
      meta: { role: a.role },
    });
    throw ApiError.forbidden('That week is not yours to change.');
  }

  const row = await prisma.user.update({
    where: { id: target },
    data: { avail: req.body as never },
    select: { id: true, avail: true },
  });

  await audit.record({
    actorId: a.id,
    action: 'availability.changed',
    subjectType: 'user',
    subjectId: target,
    meta: { avail: req.body as never },
  });

  return ok(res, row);
}

/* -------------------------------------------------------------- leave */

export async function mine(req: Request, res: Response) {
  return ok(res, await leave.listMine(actor(req)));
}

export async function apply(req: Request, res: Response) {
  return created(res, await leave.apply(actor(req), req.body as never));
}

export async function withdraw(req: Request, res: Response) {
  return ok(res, await leave.withdraw(actor(req), req.params.id as string));
}

export async function respond(req: Request, res: Response) {
  const { accept } = req.body as { accept: boolean };
  return ok(res, await leave.respond(actor(req), req.params.id as string, accept));
}

export async function team(req: Request, res: Response) {
  return ok(res, await leave.listTeam(actor(req)));
}

export async function board(req: Request, res: Response) {
  return ok(res, await leave.board(actor(req), req.params.id as string));
}

export async function plan(req: Request, res: Response) {
  return ok(res, await leave.plan(actor(req), req.params.id as string, req.body as never));
}

export async function approvals(req: Request, res: Response) {
  return ok(res, await leave.listApprovals(actor(req)));
}

export async function approve(req: Request, res: Response) {
  return ok(res, await leave.approve(actor(req), req.params.id as string));
}

export async function decline(req: Request, res: Response) {
  const { reason } = req.body as { reason: string };
  return ok(res, await leave.decline(actor(req), req.params.id as string, reason));
}

export async function getConfig(_req: Request, res: Response) {
  return ok(res, await leave.getConfig());
}

export async function setConfig(req: Request, res: Response) {
  const { approverRole } = req.body as { approverRole: string };
  return ok(res, await leave.setConfig(actor(req), approverRole));
}
