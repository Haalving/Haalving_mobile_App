import type { Request, Response } from 'express';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { requireUser } from '../middleware/authenticate.js';
import * as community from '../services/community.service.js';
import { loadScoper } from '../services/scope.service.js';
import { created, ok } from '../utils/apiResponse.js';

/**
 * Community. Parse, call the service, respond — no logic here.
 *
 * Every handler resolves the caller's SCOPE first, because the department a
 * scope rule needs sits on the user row rather than in the token, and a claim
 * minted fifteen minutes ago is not the place to read a permission from.
 *
 * NOTHING IN THIS FILE DECIDES ANYTHING. Whether the caller may author here, may
 * delete, may reach clients' own threads, whether this is the last gathering, and
 * whether a refusal has been logged are all settled in `community.service.ts` —
 * the console is one caller of several, and a check that lives in a handler is a
 * check the mobile app does not inherit.
 */

type GatheringInput = z.infer<typeof schemas.gatheringSchema>;
type ChallengeInput = z.infer<typeof schemas.challengeSchema>;
type GameDayInput = z.infer<typeof schemas.gameDaySchema>;
type PostInput = z.infer<typeof schemas.postSchema>;
type ModerateInput = z.infer<typeof schemas.moderatePostSchema>;
type ZoneInput = z.infer<typeof schemas.zoneSchema>;
type ReachInput = z.infer<typeof schemas.reachSchema>;
type SendInput = z.infer<typeof schemas.sendBroadcastSchema>;
type FeedQuery = z.infer<typeof schemas.feedQuery>;

/** The six tabs, their counts, and what this caller may do with them. */
export async function sections(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.sections(scoper));
}

/* ------------------------------------------------------------- gatherings */

export async function gatherings(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.listGatherings(scoper));
}

export async function createGathering(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.createGathering(scoper, req.body as GatheringInput);
  return created(res, { id });
}

/**
 * The published list, for a seat that cannot open Community.
 *
 * No `loadScoper`: there is nothing to scope. A gathering belongs to the whole
 * community by definition, so the only question is whether it has been approved,
 * and the service answers that without asking who is looking.
 */
export async function approvedGatherings(_req: Request, res: Response) {
  return ok(res, await community.approvedGatherings());
}

export async function approveGathering(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.approveGathering(scoper, req.params.id as string));
}

export async function returnGathering(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { note } = req.body as { note: string };
  return ok(res, await community.returnGathering(scoper, req.params.id as string, note));
}

export async function updateGathering(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.updateGathering(
    scoper,
    req.params.id as string,
    req.body as GatheringInput,
  );
  return ok(res, { id });
}

export async function removeGathering(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.removeGathering(scoper, req.params.id as string));
}

/* ------------------------------------------------------------- challenges */

export async function challenges(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.listChallenges(scoper));
}

export async function createChallenge(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.createChallenge(scoper, req.body as ChallengeInput);
  return created(res, { id });
}

export async function updateChallenge(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.updateChallenge(
    scoper,
    req.params.id as string,
    req.body as ChallengeInput,
  );
  return ok(res, { id });
}

export async function removeChallenge(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.removeChallenge(scoper, req.params.id as string));
}

/* -------------------------------------------------------------- game days */

export async function gameDays(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.listGameDays(scoper));
}

export async function createGameDay(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.createGameDay(scoper, req.body as GameDayInput);
  return created(res, { id });
}

export async function updateGameDay(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.updateGameDay(
    scoper,
    req.params.id as string,
    req.body as GameDayInput,
  );
  return ok(res, { id });
}

export async function removeGameDay(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.removeGameDay(scoper, req.params.id as string));
}

/* ------------------------------------------------------------------- feed */

export async function posts(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const { lens } = req.query as FeedQuery;
  return ok(res, await community.listPosts(scoper, lens ?? 'all'));
}

export async function createPost(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return created(res, await community.createPost(scoper, req.body as PostInput));
}

export async function updatePost(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.updatePost(scoper, req.params.id as string, req.body as PostInput));
}

export async function moderatePost(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(
    res,
    await community.moderatePost(scoper, req.params.id as string, req.body as ModerateInput),
  );
}

export async function removePost(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.removePost(scoper, req.params.id as string));
}

/* ------------------------------------------------------------------ zones */

export async function circle(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.circle(scoper));
}

export async function zones(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.listZones(scoper));
}

export async function createZone(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.createZone(scoper, req.body as ZoneInput);
  return created(res, { id });
}

export async function updateZone(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = await community.updateZone(scoper, req.params.id as string, req.body as ZoneInput);
  return ok(res, { id });
}

export async function removeZone(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.removeZone(scoper, req.params.id as string));
}

/* ---------------------------------------------------------- announcements */

export async function announcements(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.listBroadcasts(scoper));
}

export async function composer(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.composer(scoper));
}

export async function reach(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await community.previewReach(scoper, req.body as ReachInput));
}

/**
 * 201, because a record of the send is created — and the SENDER is the caller,
 * taken from the token. A body that could name a sender would let somebody
 * announce to every client on the platform in a colleague's name, which is the
 * one field on a broadcast nobody else may set.
 */
export async function send(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const ip = req.ip;
  return created(res, await community.send(scoper, req.body as SendInput, ip ? { ip } : {}));
}
