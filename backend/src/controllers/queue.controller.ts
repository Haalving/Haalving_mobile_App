import type { Request, Response } from 'express';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { requireUser } from '../middleware/authenticate.js';
import * as queues from '../services/queues.service.js';
import { loadScoper } from '../services/scope.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * Work Queues. Parse, call the service, respond — no logic here.
 *
 * Every handler resolves the caller's SCOPE first, because the department a
 * scope rule needs sits on the user row rather than in the token, and a claim
 * minted fifteen minutes ago is not the place to read a permission from.
 *
 * NOTHING IN THIS FILE DECIDES ANYTHING. Which boards a caller may see, whose
 * signature is next, whether a rating carries the note it owes and whether a
 * refusal has been logged are all settled in `queues.service.ts` — the console is
 * one caller of several, and a check that lives in a handler is a check the
 * mobile app does not inherit.
 */

type WorklistQuery = z.infer<typeof schemas.worklistQuery>;
type RateMealInput = z.infer<typeof schemas.rateMealSchema>;
type SignSummaryInput = z.infer<typeof schemas.signSummarySchema>;

/** The tabs, their counts and the waiting pill — the whole host in one call. */
export async function boards(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.boards(scoper));
}

/* ---------------------------------------------------------------- work list */

export async function worklist(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.listWorklist(scoper, req.query as WorklistQuery));
}

export async function createWork(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return created(res, await queues.createWork(scoper, req.body as never));
}

export async function worklistDone(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.markWorklistDone(scoper, req.params.id as string));
}

/* ---------------------------------------------------------------- approvals */

export async function approvals(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.listApprovals(scoper));
}

/**
 * 201, because a row is created — and the OWNER is the caller, taken from the
 * token. A body that could name an owner would let somebody raise a sign-off in
 * a colleague's name, which is the one field on an approval nobody else may set.
 */
export async function createApproval(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return created(res, await queues.create(scoper, req.body as never));
}

export async function submitApproval(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { note } = req.body as { note?: string };
  return ok(res, await queues.submit(scoper, req.params.id as string, note));
}

export async function signApproval(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { note } = req.body as { note?: string };
  return ok(res, await queues.sign(scoper, req.params.id as string, note));
}

export async function returnApproval(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { reason } = req.body as { reason: string };
  return ok(res, await queues.returnApproval(scoper, req.params.id as string, reason));
}

/* -------------------------------------------------------------------- meals */

export async function meals(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.listMeals(scoper));
}

export async function rateMeal(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const body = req.body as RateMealInput;
  return ok(res, await queues.rateMeal(scoper, req.params.id as string, body));
}

/* ------------------------------------------------------------------ medical */

export async function medical(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.listMedical(scoper));
}

export async function signSummary(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const body = req.body as SignSummaryInput;
  return ok(res, await queues.signSummary(scoper, req.params.id as string, body));
}

/* -------------------------------------------------- deviations, live board */

export async function deviations(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.listDeviations(scoper));
}

/** Stamp the board read. The caller is the token's, never the body's. */
export async function markDeviationsSeen(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { ids } = req.body as { ids: string[] };
  return ok(res, await queues.markDeviationsSeen(scoper, ids));
}

export async function live(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await queues.live(scoper));
}
