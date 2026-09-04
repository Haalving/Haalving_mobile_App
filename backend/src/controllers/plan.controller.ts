import type { Request, Response } from 'express';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { requireUser } from '../middleware/authenticate.js';
import { loadScoper } from '../services/scope.service.js';
import * as plan from '../services/plan.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * The client's plan — a ticket per pillar.
 *
 * Parse, call, respond. Every handler resolves the caller's SCOPE first: the
 * department a scope rule needs lives on the user row, not in the token, so it is
 * loaded per request rather than trusted from a claim that could be stale. Every
 * write answers with the pillar's whole block, so the tab redraws from one shape
 * whether it just read or just wrote.
 */

const who = (req: Request) => loadScoper(requireUser(req));
const id = (req: Request) => req.params.id as string;
const pillar = (req: Request) => req.params.pillar as string;

export async function getPlan(req: Request, res: Response) {
  return ok(res, await plan.getPlan(await who(req), id(req)));
}

export async function templatesFor(req: Request, res: Response) {
  return ok(res, await plan.templatesFor(await who(req), id(req), pillar(req)));
}

/** "Call a template" — staged on the ticket, the client's calendar untouched. */
export async function call(req: Request, res: Response) {
  const body = req.body as z.infer<typeof schemas.callPlanSchema>;
  return ok(res, await plan.callTemplate(await who(req), id(req), pillar(req), body));
}

/** "Edit day" — the day's slots, saved whole onto the ticket. `day` is coerced by the param schema. */
export async function editDay(req: Request, res: Response) {
  const body = req.body as z.infer<typeof schemas.planDaySchema>;
  return ok(res, await plan.editDay(await who(req), id(req), pillar(req), Number(req.params.day), body));
}

/** The client's own hour, dose or daily targets — staged, or staged as a clear. */
export async function tune(req: Request, res: Response) {
  const body = req.body as z.infer<typeof schemas.planTuneSchema>;
  return ok(res, await plan.tune(await who(req), id(req), pillar(req), body));
}

/** "Approve — publish": the ticket, copied wholesale onto the live plan. */
export async function publish(req: Request, res: Response) {
  return ok(res, await plan.publishPlan(await who(req), id(req), pillar(req)));
}

/** "Discard draft": the ticket goes; the live plan stays exactly as it is. */
export async function discard(req: Request, res: Response) {
  return ok(res, await plan.discardDraft(await who(req), id(req), pillar(req)));
}

/** "Ask AI to fit" — proposes; writes nothing. */
export async function fit(req: Request, res: Response) {
  return ok(res, await plan.fit(await who(req), id(req), pillar(req)));
}

/** "Save as new template" — the live plan, overrides baked in, as a draft template. */
export async function saveTemplate(req: Request, res: Response) {
  const body = req.body as z.infer<typeof schemas.saveAsTemplateSchema>;
  return ok(res, await plan.saveAsTemplate(await who(req), id(req), pillar(req), body.name), 201);
}

/**
 * The arrival check-ins, for the care team.
 *
 * No permission beyond the client's own scope — see `plan.service.emotions`.
 */
export async function emotions(req: Request, res: Response) {
  return ok(res, await plan.emotions(await who(req), id(req)));
}
