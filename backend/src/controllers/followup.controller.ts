import type { DismissReason } from '@prisma/client';
import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as followups from '../services/followups.service.js';
import { loadScoper } from '../services/scope.service.js';
import { created, noContent, ok } from '../utils/apiResponse.js';

/**
 * Follow-ups. Parse, call the service, respond — no logic here.
 *
 * Every handler resolves the caller's SCOPE first: the department a scope rule
 * needs is on the user row, not in the token, so it is loaded per request rather
 * than trusted from a claim that could be stale.
 *
 * WHICH ROAD A DRAFT TAKES IS NOT DECIDED HERE. Whether a draft may go out at
 * all, whether it needs an approver first, and whose name it goes out under are
 * all settled in followups.service.ts, because the console is one caller of
 * several — the mobile app and the batch path in `sendAll` are others — and a
 * check that lives in a handler is a check the next caller does not inherit.
 */

export async function list(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await followups.list(scoper));
}

/**
 * 201 even when `sendNow` carried the draft straight through approval: a row was
 * created at /followups/:id either way, and the caller reads the status off the
 * row it gets back rather than off the code.
 */
export async function create(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return created(res, await followups.create(scoper, req.body as never));
}

export async function edit(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { text } = req.body as { text: string };
  return ok(res, await followups.edit(scoper, req.params.id as string, text));
}

export async function send(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await followups.send(scoper, req.params.id as string));
}

export async function dismiss(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { reason } = req.body as { reason: DismissReason };
  return ok(res, await followups.dismiss(scoper, req.params.id as string, reason));
}

export async function approve(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { text } = req.body as { text?: string };
  return ok(res, await followups.approve(scoper, req.params.id as string, text));
}

export async function returnDraft(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { note } = req.body as { note: string };
  return ok(res, await followups.returnDraft(scoper, req.params.id as string, note));
}

export async function resubmit(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await followups.resubmit(scoper, req.params.id as string));
}

/**
 * 204, and the service's `{ id }` is deliberately dropped. A withdrawn draft
 * leaves nothing to render, and a body echoing the id the caller just put in the
 * URL is a shape the console would have to handle for no information.
 */
export async function remove(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  await followups.remove(scoper, req.params.id as string);
  return noContent(res);
}

export async function sendAll(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { ids } = req.body as { ids: string[] };
  return ok(res, await followups.sendAll(scoper, ids));
}
