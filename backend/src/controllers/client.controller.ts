import type { Request, Response } from 'express';

import { requireUser } from '../middleware/authenticate.js';
import * as circleService from '../services/circle.service.js';
import * as clientLogsService from '../services/client-logs.service.js';
import * as clientRecordService from '../services/client-record.service.js';
import * as clientService from '../services/client.service.js';
import { loadScoper } from '../services/scope.service.js';
import { ok } from '../utils/apiResponse.js';

/**
 * Every handler resolves the caller's SCOPE first. The department a scope rule
 * needs is not in the token — it is on the user row — so it is loaded per
 * request rather than trusted from a claim that could be stale.
 */
export async function list(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientService.list(scoper, req.query as never));
}

export async function get(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientService.get(scoper, req.params.id as string));
}

/** The record's merged log — every source, time-sorted, bucketed for the chips. */
export async function logs(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientLogsService.clientLogs(scoper, req.params.id as string));
}

/** The Trackers panel — water/steps/sleep/meals, compliance, and the session rings. */
export async function trackers(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientRecordService.clientTrackers(scoper, req.params.id as string));
}

/** The Meetings panel — the Schedule's meeting rows for this client, with times + links. */
export async function meetings(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientRecordService.clientMeetings(scoper, req.params.id as string));
}

/** The Documents panel — the client's medical summaries / attachments. */
export async function documents(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(res, await clientRecordService.clientDocuments(scoper, req.params.id as string));
}

export async function assignPodSeat(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  return ok(
    res,
    await clientService.assignPodSeat(
      scoper,
      req.params.id as string,
      req.params.pillarKey as string,
      req.body as never,
      req.ip,
    ),
  );
}

/* ────────────────────────────────────────────────────────── the care circle */

/**
 * A client's room, one lane at a time.
 *
 * THE CLIENT DETAIL IS LOADED FIRST, and not for its data — `clientService.get`
 * is what applies the caller's scope and 404s a client they may not see. Reading
 * the room without it would answer "does this person exist" to anybody holding a
 * token, which is the fact the 404-not-403 rule exists to protect.
 */
export async function circle(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = req.params.id as string;
  await clientService.get(scoper, id);

  const lane = req.query.lane === 'team' ? 'team' : 'client';
  return ok(res, await circleService.thread(id, lane));
}

/**
 * Post into a client's room.
 *
 * EVERY MESSAGE RECORDS A HUMAN AUTHOR. `fromUserId` is the caller and nothing
 * else — this door cannot post as the client, and it cannot post as the AI. The
 * lane is chosen by `teamOnly`, and a team note is the only kind this endpoint
 * writes besides plain text: an artifact or a rating arrives through the chain
 * or the meals board, never by hand.
 */
export async function postCircle(req: Request, res: Response) {
  const scoper = await loadScoper(requireUser(req));
  const id = req.params.id as string;
  await clientService.get(scoper, id);

  const body = req.body as { text: string; teamOnly?: boolean };
  const posted = await circleService.postMessage(id, {
    fromUserId: scoper.id,
    fromKind: 'STAFF',
    kind: body.teamOnly ? 'TEAMONLY' : 'TEXT',
    text: body.text,
  });
  return ok(res, posted);
}
