import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as clientApp from '../services/client-app/index.js';
import * as planApp from '../services/client-app/plan.js';
import * as community from '../services/community.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * The client app's controllers. Parse, call, respond — no logic here.
 *
 * NAMED `client-app` RATHER THAN `client` because `client.controller.ts` already
 * exists and belongs to the CONSOLE: it serves `/clients`, the staff-facing roster
 * and care circle. Two different audiences, two files, and the names say which is
 * which — the alternative is a reader opening the wrong one and adding a staff
 * route to the client surface.
 *
 * NO HANDLER TAKES A CLIENT ID. Every one passes `requireUser(req).id` and lets
 * the service resolve the client from the session. An id in a path is a value the
 * caller chooses, and this surface is reached by people who are not staff — so the
 * only safe answer to "whose record is this" is the token's.
 */

const who = (req: Request): string => requireUser(req).id;

export async function me(req: Request, res: Response) {
  return ok(res, await clientApp.me(who(req)));
}

export async function today(req: Request, res: Response) {
  const day = typeof req.query.day === 'string' ? req.query.day : undefined;
  return ok(res, await clientApp.today(who(req), day));
}

export async function joinSession(req: Request, res: Response) {
  return ok(res, await clientApp.joinSession(who(req), req.params.id as string));
}

export async function profile(req: Request, res: Response) {
  return ok(res, await clientApp.profile(who(req)));
}

/**
 * Log a plate.
 *
 * The body is validated at the route; everything the client may author is in it,
 * and nothing else on the row is reachable from here.
 */
export async function captureMeal(req: Request, res: Response) {
  return created(res, await clientApp.captureMeal(who(req), req.body));
}

export async function mealDetail(req: Request, res: Response) {
  return ok(res, await clientApp.mealDetail(who(req), req.params.id as string));
}

/** The coach marketplace, per pillar, with the client's own coach marked. */
export async function coaches(req: Request, res: Response) {
  return ok(res, await clientApp.coaches(who(req)));
}

/** The tracker hub — the six signals (real) and the nutrient panel (next pass). */
export async function trackers(req: Request, res: Response) {
  return ok(res, await clientApp.trackers(who(req)));
}

/** Quick-add write — a glass, a sleep, a step count or a weigh-in; reads the signals back. */
export async function logTrackers(req: Request, res: Response) {
  return ok(res, await clientApp.logTrackers(who(req), req.body));
}

/** The client's own settings — notification toggles, announce opt-out, consents. */
export async function settings(req: Request, res: Response) {
  return ok(res, await clientApp.settings(who(req)));
}

/** Flip a notification toggle or the announcements opt-out, and read it back. */
export async function updateSettings(req: Request, res: Response) {
  return ok(res, await clientApp.updateSettings(who(req), req.body));
}

/** Record "How are you arriving?" for this morning. */
export async function setArrival(req: Request, res: Response) {
  return ok(res, await clientApp.setArrival(who(req), req.body.mood, req.body.note));
}

/** Register this device's Expo push token. */
export async function registerPushToken(req: Request, res: Response) {
  return ok(res, await clientApp.registerPushToken(who(req), req.body.token, req.body.platform));
}

/** The care-circle thread — teamonly lines never reach here (rule 2). */
export async function circle(req: Request, res: Response) {
  return ok(res, await clientApp.circle(who(req)));
}

/** The plan hub — cycle, calendar, ledger, level-up and daily targets. */
export async function plan(req: Request, res: Response) {
  return ok(res, await planApp.plan(who(req)));
}

/** One pillar's full level-up detail. */
export async function planDetail(req: Request, res: Response) {
  return ok(res, await planApp.planDetail(who(req), req.params.pillar as string));
}

/** The whole cycle calendar with its per-day session items. */
export async function planFull(req: Request, res: Response) {
  return ok(res, await planApp.planFull(who(req)));
}

/** Mark the thread caught up, clearing the unread dot on /client/me. */
export async function markCircleRead(req: Request, res: Response) {
  return ok(res, await clientApp.markCircleRead(who(req)));
}

/**
 * The community's published gatherings.
 *
 * Moved here from the console's route file so there is one client surface. It
 * takes no user because there is nothing to scope: a gathering belongs to the
 * whole community, so the only question is whether it has been approved, and the
 * service answers that without asking who is looking.
 */
export async function gatherings(_req: Request, res: Response) {
  return ok(res, await community.approvedGatherings());
}
