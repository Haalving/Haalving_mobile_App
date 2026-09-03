import { prisma } from '../../config/prisma.js';

/**
 * WHAT THE MORNING CAN ACTUALLY SEE.
 *
 * Every digest rule reads one of two timestamped trails and nothing else:
 *
 *   - `Meal.capturedAt` — a plate, with the photo and the rating that followed
 *   - `CircleMessage.createdAt` where `fromKind = CLIENT` — the client's own words
 *
 * THE TRACKERS ARE NOT A TRAIL. `Client.trackers` is a standing blob that
 * `logTrackers` partial-merges into (client-app/index.ts) — water at 6 of 8,
 * last night's sleep — with no timestamp and no previous row. It answers "where
 * are they now", never "when did they last". So a rule that wants to know
 * whether somebody has gone quiet cannot ask it, and one that pretended to would
 * report silence for a client who logs water every day and never eats on camera.
 *
 * When a tracker history table lands, this is the file that grows a third
 * source and the rules keep their shape.
 */

/** The client facts every rule reads, gathered once so five rules make one query. */
export const DIGEST_CLIENT = {
  id: true,
  name: true,
  plan: true,
  status: true,
  observation: true,
  onboardedAt: true,
  createdAt: true,
  cycle: true,
  cycleDay: true,
  shapeVersion: true,
  levels: true,
  track: true,
  sessions: true,
  culturePhotos: true,
  compliance: true,
  trackers: true,
} as const;

export type DigestClient = Awaited<ReturnType<typeof digestClients>>[number];

/**
 * The clients a morning is about.
 *
 * ACTIVE ONLY. A paused client is not being worked, and a line saying they have
 * logged nothing for three days is true, useless and slightly cruel — it
 * describes the pause, not the person. The digest is a round of the people
 * somebody is actually carrying today.
 */
export async function digestClients(only?: string[]) {
  return prisma.client.findMany({
    where: { status: 'active', ...(only ? { id: { in: only } } : {}) },
    select: DIGEST_CLIENT,
    orderBy: { name: 'asc' },
  });
}

/** "Rajesh D." -> "Rajesh". The name a nudge is written to. */
export const firstName = (name?: string | null): string =>
  (name ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * The last time each client did ANYTHING the database can see, keyed by client.
 *
 * Two queries rather than one per client: the newest plate per client and the
 * newest message they wrote, merged in memory. A client who has never done
 * either is absent from the map, which is a different fact from "long ago" and
 * the callers treat it as one.
 */
export async function lastSeenByClient(only?: string[]): Promise<Map<string, Date>> {
  const scope = only ? { clientId: { in: only } } : {};
  const [meals, messages] = await Promise.all([
    prisma.meal.groupBy({ by: ['clientId'], where: scope, _max: { capturedAt: true } }),
    prisma.circleMessage.groupBy({
      by: ['clientId'],
      where: { ...scope, fromKind: 'CLIENT' },
      _max: { createdAt: true },
    }),
  ]);

  const seen = new Map<string, Date>();
  const keep = (clientId: string, at: Date | null) => {
    if (!at) return;
    const held = seen.get(clientId);
    if (!held || at > held) seen.set(clientId, at);
  };
  for (const m of meals) keep(m.clientId, m._max.capturedAt);
  for (const m of messages) keep(m.clientId, m._max.createdAt);
  return seen;
}

/** Whole days between two instants, floored — "3 days ago" means 72 hours or more. */
export const daysSince = (then: Date, now: Date): number =>
  Math.floor((now.getTime() - then.getTime()) / 86_400_000);

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "Tue evening" — how a person says when somebody was last around.
 *
 * The demo's own phrasing for Meena's line. Anything older than a week gets the
 * date instead, because "Tue evening" nine days later names the wrong Tuesday.
 */
export function lastSeenWords(at: Date, now: Date): string {
  const part = at.getHours() < 12 ? 'morning' : at.getHours() < 17 ? 'afternoon' : 'evening';
  if (daysSince(at, now) >= 7) {
    return `${at.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][at.getMonth()]}`;
  }
  return `${WEEKDAY[at.getDay()]} ${part}`;
}
