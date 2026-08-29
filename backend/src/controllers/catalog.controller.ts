import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as catalog from '../services/catalog.service.js';
import { created, ok } from '../utils/apiResponse.js';

/** The Catalog. Parse, call the service, respond — no logic here. */

const actor = (req: Request) => {
  const u = requireUser(req);
  return { id: u.id, role: u.role };
};

export async function read(req: Request, res: Response) {
  return ok(res, await catalog.readAll(actor(req)));
}

export async function createItem(req: Request, res: Response) {
  return created(res, await catalog.createItem(actor(req), req.body as never));
}

export async function updateItem(req: Request, res: Response) {
  return ok(res, await catalog.updateItem(actor(req), req.params.id as string, req.body as never));
}

export async function archiveItem(req: Request, res: Response) {
  const { archived } = req.body as { archived: boolean };
  return ok(res, await catalog.archiveItem(actor(req), req.params.id as string, archived));
}

export async function createTemplate(req: Request, res: Response) {
  return created(res, await catalog.createTemplate(actor(req), req.body as never));
}

export async function updateTemplate(req: Request, res: Response) {
  return ok(
    res,
    await catalog.updateTemplate(actor(req), req.params.id as string, req.body as never),
  );
}

export async function deleteTemplate(req: Request, res: Response) {
  return ok(res, await catalog.deleteTemplate(actor(req), req.params.id as string));
}

export async function publishTemplate(req: Request, res: Response) {
  const { published } = req.body as { published: boolean };
  return ok(res, await catalog.setTemplatePublished(actor(req), req.params.id as string, published));
}
