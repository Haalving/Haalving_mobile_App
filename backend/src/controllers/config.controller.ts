import type { Request, Response } from 'express';
import { PLANS, PLAN_KEYS } from '@haalving/shared';

import { requireUser } from '../middleware/authenticate.js';
import * as write from '../services/configWrite.service.js';
import { created, ok } from '../utils/apiResponse.js';

/** Configuration. Parse, call the service, respond — no logic here. */

const actor = (req: Request) => {
  const u = requireUser(req);
  return { id: u.id, role: u.role };
};

export async function read(_req: Request, res: Response) {
  return ok(res, await write.readAll());
}

/**
 * The plans, straight from `shared/plans.ts`.
 *
 * PRODUCT-DEFINED and read-only: the tab renders them and nothing edits them.
 * They are not a table because a plan is not a setting — changing what Poorna
 * means is a change to the product, not to a deployment.
 */
export async function plans(_req: Request, res: Response) {
  return ok(
    res,
    PLAN_KEYS.map((k) => PLANS[k]),
  );
}

export async function setProgram(req: Request, res: Response) {
  return ok(res, await write.setProgram(actor(req), req.body as never));
}

export async function setService(req: Request, res: Response) {
  return ok(res, await write.setService(actor(req), req.body as never));
}

export async function setChain(req: Request, res: Response) {
  const { steps } = req.body as { steps: Array<{ role: string }> };
  return ok(res, await write.setChain(actor(req), req.params.kind as never, steps));
}

export async function createNotifRule(req: Request, res: Response) {
  return created(res, await write.createNotifRule(actor(req), req.body as never));
}

export async function updateNotifRule(req: Request, res: Response) {
  return ok(res, await write.updateNotifRule(actor(req), req.params.id as string, req.body as never));
}

export async function deleteNotifRule(req: Request, res: Response) {
  return ok(res, await write.deleteNotifRule(actor(req), req.params.id as string));
}

export async function createFlow(req: Request, res: Response) {
  return created(res, await write.createFlow(actor(req), req.body as never));
}

export async function updateFlow(req: Request, res: Response) {
  return ok(res, await write.updateFlow(actor(req), req.params.id as string, req.body as never));
}

export async function deleteFlow(req: Request, res: Response) {
  return ok(res, await write.deleteFlow(actor(req), req.params.id as string));
}

export async function addStep(req: Request, res: Response) {
  return created(res, await write.addStep(actor(req), req.params.id as string, req.body as never));
}

export async function updateStep(req: Request, res: Response) {
  return ok(
    res,
    await write.updateStep(
      actor(req),
      req.params.id as string,
      req.params.stepId as string,
      req.body as never,
    ),
  );
}

export async function deleteStep(req: Request, res: Response) {
  return ok(
    res,
    await write.deleteStep(actor(req), req.params.id as string, req.params.stepId as string),
  );
}

export async function createCategory(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  return created(res, await write.createCategory(actor(req), name));
}

export async function renameCategory(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  return ok(res, await write.renameCategory(actor(req), req.params.key as string, name));
}

export async function deleteCategory(req: Request, res: Response) {
  return ok(res, await write.deleteCategory(actor(req), req.params.key as string));
}

export async function createTag(req: Request, res: Response) {
  const { name } = req.body as { name: string };
  return created(res, await write.createTag(actor(req), name));
}

export async function deleteTag(req: Request, res: Response) {
  return ok(res, await write.deleteTag(actor(req), req.params.id as string));
}
