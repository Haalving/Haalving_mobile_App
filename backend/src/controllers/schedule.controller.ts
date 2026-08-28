import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as groups from '../services/groups.service.js';
import * as schedule from '../services/schedule.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * The Schedule. Parse, call the service, respond — no logic here.
 *
 * The actor comes from the token on every call: who is booking, accepting or
 * dragging is a fact about the session, and a body that could name somebody else
 * would let one person accept a meeting on another's behalf.
 */

const actor = (req: Request) => {
  const u = requireUser(req);
  return { id: u.id, role: u.role };
};

export async function list(req: Request, res: Response) {
  return ok(res, await schedule.list(actor(req), req.query as never));
}

export async function listGroups(_req: Request, res: Response) {
  return ok(res, await groups.listGroups());
}

/**
 * Create — or, with `?dryRun=1`, only say whether it WOULD be refused.
 *
 * The dry run exists so the task sheet can show its live clash line from the same
 * code that does the refusing. Without it the browser would need its own copy of
 * the rule, and the sentence a coach reads while typing could differ from the one
 * they are given on submit.
 */
export async function create(req: Request, res: Response) {
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const result = await schedule.create(actor(req), req.body as never, { dryRun });
  return dryRun ? ok(res, result) : created(res, result);
}

export async function edit(req: Request, res: Response) {
  return ok(res, await schedule.edit(actor(req), req.params.id as string, req.body as never));
}

export async function move(req: Request, res: Response) {
  return ok(res, await schedule.move(actor(req), req.params.id as string, req.body as never));
}

export async function remove(req: Request, res: Response) {
  const { scope, date } = req.query as { scope: string; date?: string };
  return ok(res, await schedule.remove(actor(req), req.params.id as string, scope, date));
}

export async function setDone(req: Request, res: Response) {
  const { date, done } = req.body as { date: string; done: boolean };
  return ok(res, await schedule.setDone(actor(req), req.params.id as string, date, done));
}

export async function respond(req: Request, res: Response) {
  const { state } = req.body as { state: string };
  return ok(res, await schedule.respond(actor(req), req.params.id as string, state));
}

export async function propose(req: Request, res: Response) {
  return created(res, await schedule.propose(actor(req), req.params.id as string, req.body as never));
}

export async function applyProposal(req: Request, res: Response) {
  return ok(res, await schedule.applyProposal(actor(req), req.params.id as string));
}

export async function shift(req: Request, res: Response) {
  const { deltaDays } = req.body as { deltaDays: number };
  return ok(res, await schedule.shift(actor(req), req.params.id as string, deltaDays));
}
