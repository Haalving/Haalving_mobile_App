import { PILLAR_KEYS } from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/apiResponse.js';
import { todayISO } from '../../utils/dates.js';
import * as audit from '../audit.service.js';
import { activeCovers, resolveSeat } from '../covers.service.js';
import { isObservation, maySeeRating, stripAi, type ClientFacts } from './rules.js';

/**
 * The client's own window onto their record.
 *
 * ONE RESOLUTION OF WHO IS ASKING, and it is the token. No endpoint here takes a
 * client id: an id in a URL is a thing the caller chooses, and this surface is
 * reached by people who are not staff. `meFor` turns the session into a client row
 * and every other function takes that row.
 *
 * Every read passes through `./rules`, which is where the five things a client
 * must not see are enforced — once, rather than five times.
 */

const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** The client behind this session, or a refusal. */
export async function meFor(userId: string) {
  const client = await prisma.client.findFirst({
    where: { userId },
    select: {
      id: true,
      name: true,
      plan: true,
      humanPillars: true,
      observation: true,
      cycle: true,
      cycleDay: true,
      levels: true,
      status: true,
    },
  });
  /*
   * 404 rather than 403. A staff token never reaches here — `clientOnly` refuses
   * it at the door — so the only way to arrive without a client row is a login
   * with no record behind it, which is not a permission problem.
   */
  if (!client) throw ApiError.notFound('No client record for this account.');
  return client;
}

export function facts(c: {
  plan: string;
  humanPillars: string[];
  observation: boolean;
  cycle: number;
  cycleDay: number;
}): ClientFacts {
  return {
    plan: c.plan,
    humanPillars: c.humanPillars,
    observation: c.observation,
    cycle: c.cycle,
    cycleDay: c.cycleDay,
  };
}

/**
 * WHO A CLIENT'S COACHES ACTUALLY ARE TODAY.
 *
 * Cover-aware, through `activeCovers` + `resolveSeat`, and deliberately not
 * `seatHolder`. That one is a synchronous fallback answering the OWNER — right
 * whenever no cover is running, and wrong on exactly the day one is, which is the
 * day a client most needs the name to be correct. If the Dietician is on leave the
 * app must say who is standing in, because that is who will answer.
 */
export async function pod(clientId: string) {
  const [seats, covers] = await Promise.all([
    prisma.podSeat.findMany({
      where: { clientId },
      select: { seat: true, staffId: true },
    }),
    activeCovers(),
  ]);

  const held = seats.map((s) => {
    const { staffId, coveredBy } = resolveSeat(covers, clientId, s.seat as string, s.staffId);
    return { seat: s.seat as string, staffId, coveredBy };
  });

  const ids = [...new Set(held.map((h) => h.staffId).filter((v): v is string => !!v))];
  const people = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(people.map((p) => [p.id, p]));

  return held.map((h) => ({
    seat: h.seat,
    /* the name a client reads is whoever holds the seat TODAY */
    coach: h.staffId ? (byId.get(h.staffId) ?? null) : null,
    /* true while somebody is standing in; the app says so rather than pretending */
    covering: h.coveredBy !== null,
  }));
}

/** `GET /client/me` — the facts every screen needs before it can draw anything. */
export async function me(userId: string) {
  const c = await meFor(userId);
  const f = facts(c);

  const seats = await pod(c.id);

  /*
   * THE UNREAD DOT IS NOT COMPUTABLE YET, and answering 0 is the honest shape.
   *
   * It wants "messages since this client last looked", and there is no read
   * receipt to look at: `circle.service` says so in its own header — "Reads,
   * unread counts and the chat UI are deliberately not here". Inventing a number
   * from message age would light a dot that never clears.
   *
   * My Circle is Sprint C2 and the receipt table lands with it; the field is here
   * now so the app can bind to it and the shape does not change under the screen.
   */
  const unread = 0;

  return {
    id: c.id,
    name: c.name,
    plan: c.plan,
    cycle: c.cycle,
    day: c.cycleDay,
    /* the app routes on this: observation gets a different Today and Journey */
    observation: isObservation(f),
    levels: c.levels,
    pod: seats,
    unread,
  };
}

/** The plate and its counter. Rules 1 and 3 both land here. */
async function mealsFor(clientId: string, date: Date, f: ClientFacts) {
  const next = new Date(date.getTime() + 86_400_000);
  const rows = await prisma.meal.findMany({
    where: { clientId, capturedAt: { gte: date, lt: next } },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      slot: true,
      capturedAt: true,
      photo: true,
      dishes: true,
      fullness: true,
      finalStars: true,
      finalNote: true,
      aiStars: true,
      aiConf: true,
      aiDetected: true,
      aiNote: true,
    },
  });

  return rows.map((m) => {
    const shaped = stripAi({ ...m }, f, 'culture') as Record<string, unknown>;
    delete shaped.finalStars;
    delete shaped.finalNote;
    return {
      ...shaped,
      capturedAt: m.capturedAt.toISOString(),
      /*
       * Rule 3. In observation nobody has rated anything, and printing a null
       * where a rating goes reads as a coach who has not got round to it rather
       * than a baseline week where rating is not the point.
       */
      stars: maySeeRating(f) ? m.finalStars : null,
      note: maySeeRating(f) ? m.finalNote : null,
    };
  });
}

/**
 * `GET /client/today?day=` — one day of the client's own week.
 *
 * OBSERVATION IS A DIFFERENT ANSWER, not a filtered one. Days 1 to 5 have no
 * booked sessions because none exist yet, and handing back an empty list would
 * read as a coach who forgot rather than a baseline week that has not started.
 */
export async function today(userId: string, dayIso?: string) {
  const c = await meFor(userId);
  const f = facts(c);
  const date = asDate(dayIso ?? todayISO());
  const iso = date.toISOString().slice(0, 10);

  if (isObservation(f)) {
    return {
      observation: true as const,
      date: iso,
      cycle: c.cycle,
      day: c.cycleDay,
      sessions: [] as unknown[],
      meals: await mealsFor(c.id, date, f),
    };
  }

  const rows = await prisma.task.findMany({
    where: { clientId: c.id, date, kind: 'SESSION' },
    orderBy: [{ startMin: 'asc' }],
    select: {
      id: true,
      title: true,
      pillar: true,
      startMin: true,
      durMin: true,
      link: true,
      dones: { where: { date }, select: { at: true }, take: 1 },
    },
  });

  const seats = await pod(c.id);
  const byPillar = new Map(seats.map((s) => [s.seat, s.coach]));

  return {
    observation: false as const,
    date: iso,
    cycle: c.cycle,
    day: c.cycleDay,
    sessions: rows.map((t) => ({
      id: t.id,
      title: t.title,
      pillar: t.pillar,
      startMin: t.startMin,
      durMin: t.durMin,
      /*
       * The join door. Whether there IS a room is served; the room is not built
       * here by instruction, and the link itself only leaves the server when the
       * client actually opens it — see `joinSession`.
       */
      joinable: !!t.link,
      done: t.dones.length > 0,
      coach: t.pillar ? (byPillar.get(t.pillar) ?? null) : null,
    })),
    meals: await mealsFor(c.id, date, f),
  };
}

/**
 * `POST /client/sessions/:id/join` — open the door.
 *
 * Hands back the link the console stored, and records that the client opened it.
 * The session room is out of scope for this port; this is the handle on the one
 * that already exists.
 */
export async function joinSession(userId: string, taskId: string) {
  const c = await meFor(userId);

  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId: c.id },
    select: { id: true, title: true, link: true },
  });
  /*
   * Not 403. A session that is not yours is a session that does not exist, and a
   * 403 would confirm the id names something real — the same reading `/clients`
   * takes, for the same reason.
   */
  if (!task) throw ApiError.notFound('No such session.');
  if (!task.link) throw ApiError.conflict('That session has no room yet.');

  await audit.record({
    actorId: userId,
    action: 'client.session_joined',
    subjectType: 'task',
    subjectId: task.id,
    meta: { clientId: c.id, title: task.title },
  });

  return { id: task.id, link: task.link };
}

/** `GET /client/profile` — the read side. The settings toggles arrive in C4. */
export async function profile(userId: string) {
  const c = await prisma.client.findFirst({
    where: { userId },
    select: {
      id: true,
      name: true,
      code: true,
      designation: true,
      plan: true,
      humanPillars: true,
      observation: true,
      cycle: true,
      cycleDay: true,
      levels: true,
      health: true,
      heightCm: true,
      weightKg: true,
    },
  });
  if (!c) throw ApiError.notFound('No client record for this account.');

  /*
   * THE RECORDS VAULT IS SIGNED SUMMARIES ONLY — rule 5.
   *
   * A pending summary is a document nobody has signed. The console shows it to
   * the doctor who must sign it; a client is never handed a medical reading no
   * human has yet stood behind.
   */
  const records = await prisma.medicalSummary.findMany({
    where: { clientId: c.id, status: 'READY' },
    orderBy: { uploadedOn: 'desc' },
    select: { id: true, title: true, kind: true, uploadedOn: true },
  });

  return {
    id: c.id,
    name: c.name,
    code: c.code,
    designation: c.designation,
    plan: c.plan,
    cycle: c.cycle,
    day: c.cycleDay,
    levels: c.levels,
    /* the four in the product's own order, never an object's key order */
    pillars: PILLAR_KEYS,
    health: c.health,
    heightCm: c.heightCm,
    weightKg: c.weightKg,
    pod: await pod(c.id),
    records,
  };
}
