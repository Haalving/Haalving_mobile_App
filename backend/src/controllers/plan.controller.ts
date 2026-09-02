import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import { loadScoper } from '../services/scope.service.js';
import * as plan from '../services/plan.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * The client's plan — which template each pillar is on.
 *
 * Parse, call, respond. Every handler resolves the caller's SCOPE first: the
 * department a scope rule needs lives on the user row, not in the token, so it is
 * loaded per request rather than trusted from a claim that could be stale.
 */

const who = (req: Request) => loadScoper(requireUser(req));

export async function getPlan(req: Request, res: Response) {
  return ok(res, await plan.getPlan(await who(req), req.params.id as string));
}

export async function templatesFor(req: Request, res: Response) {
  return ok(
    res,
    await plan.templatesFor(await who(req), req.params.id as string, req.params.pillar as string),
  );
}

/**
 * Assign, or clear.
 *
 * `templateId: null` is the CLEAR, and it is a PUT rather than a DELETE because
 * clearing leaves the row behind: the pillar stays "called, with no plan", which
 * is a state the screen shows differently from a pillar nobody has opened.
 */
export async function assign(req: Request, res: Response) {
  const { templateId, draft } = req.body as { templateId: string | null; draft?: boolean };
  return ok(
    res,
    await plan.assignTemplate(
      await who(req),
      req.params.id as string,
      req.params.pillar as string,
      templateId,
      draft ?? true,
    ),
  );
}

export async function publish(req: Request, res: Response) {
  return ok(
    res,
    await plan.publishPlan(await who(req), req.params.id as string, req.params.pillar as string),
  );
}

/**
 * The arrival check-ins, for the care team.
 *
 * No permission beyond the client's own scope — see `plan.service.emotions`.
 */
export async function emotions(req: Request, res: Response) {
  return ok(res, await plan.emotions(await who(req), req.params.id as string));
}
