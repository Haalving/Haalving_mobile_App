import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as arrivals from '../services/arrivals.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * The Onboarding rail. Parse, call the service, respond — no logic here.
 *
 * Every handler passes the caller through as the ACTOR rather than trusting
 * anything in the body: who is ticking is a fact about the token, and a body that
 * could name somebody else would make the DENIED events name the wrong person.
 */

const actor = (req: Request) => {
  const u = requireUser(req);
  return { id: u.id, role: u.role };
};

/** The client's address, for the audit rows that record a refusal or an override. */
const ip = (req: Request) => req.ip ?? null;

export async function list(req: Request, res: Response) {
  return ok(res, await arrivals.list(actor(req)));
}

export async function get(req: Request, res: Response) {
  return ok(res, await arrivals.get(actor(req), req.params.id as string));
}

export async function create(req: Request, res: Response) {
  return created(res, await arrivals.create(actor(req), req.body as never));
}

export async function update(req: Request, res: Response) {
  return ok(res, await arrivals.update(actor(req), req.params.id as string, req.body as never));
}

export async function tick(req: Request, res: Response) {
  return ok(res, await arrivals.setTick(actor(req), req.params.id as string, req.body as never));
}

export async function closeStep(req: Request, res: Response) {
  return ok(res, await arrivals.closeStep(actor(req), req.params.id as string));
}

export async function stepBack(req: Request, res: Response) {
  return ok(res, await arrivals.stepBack(actor(req), req.params.id as string));
}

export async function allocate(req: Request, res: Response) {
  return ok(
    res,
    await arrivals.allocate(actor(req), req.params.id as string, req.body as never, {
      ip: ip(req) ?? undefined,
    }),
  );
}

export async function inbody(req: Request, res: Response) {
  return ok(res, await arrivals.keyInBody(actor(req), req.params.id as string, req.body as never));
}

export async function welcome(req: Request, res: Response) {
  return ok(res, await arrivals.welcome(actor(req), req.params.id as string, req.body as never));
}

export async function promote(req: Request, res: Response) {
  return created(
    res,
    await arrivals.promote(actor(req), req.params.id as string, { ip: ip(req) ?? undefined }),
  );
}

/**
 * `POST /clients` — the deliberate exception, added straight to the roster.
 *
 * It lives in the ARRIVALS controller although its route is /clients, because the
 * act is an arrivals-service act: it writes the arrival, mints the client through
 * the same `birthClient` promotion uses, and needs exactly the actor and ip this
 * file already resolves. The route names the handler, so it stays findable.
 */
export async function addClientDirect(req: Request, res: Response) {
  return created(
    res,
    await arrivals.addClientDirect(actor(req), req.body as never, { ip: ip(req) ?? undefined }),
  );
}

/** The arrival's own conversation — what they have asked, and the team's replies. */
export async function thread(req: Request, res: Response) {
  return ok(res, await arrivals.thread(actor(req), req.params.id as string));
}

export async function reply(req: Request, res: Response) {
  const { text } = req.body as { text: string };
  return created(res, await arrivals.reply(actor(req), req.params.id as string, text));
}
