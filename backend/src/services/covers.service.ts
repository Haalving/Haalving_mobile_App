import { staffForSeat, type CoverWindow } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { todayISO } from '../utils/dates.js';

/**
 * `staffFor` — who actually holds a seat today.
 *
 * THIS IS THE ONLY PLACE A SEAT RESOLVES TO A PERSON. The client list's scope,
 * the Schedule's pod groups, the Onboarding capacity picker and the Attention tab
 * all read through it, because the alternative is each of them reading
 * `PodSeat.staffId` and quietly disagreeing about who is on duty this week —
 * which is exactly the bug the demo's own comment describes: "the cover moved the
 * SEAT while the appointment kept the absent coach's name."
 *
 * A cover is a DATED ROW on top of the seat, never a mutation of it. So the
 * morning after a window the seat is simply its owner's again, and there is no
 * cleanup job to fail.
 */

export interface SeatKey {
  clientId: string;
  seatKey: string;
}

/** Every cover in force today, keyed `clientId|seatKey`. */
export async function activeCovers(today = todayISO()): Promise<Map<string, CoverWindow>> {
  const day = new Date(`${today}T00:00:00.000Z`);
  const rows = await prisma.podCover.findMany({
    where: { from: { lte: day }, to: { gte: day } },
    select: { clientId: true, seatKey: true, coverId: true, from: true, to: true },
  });

  const out = new Map<string, CoverWindow>();
  for (const r of rows) {
    out.set(`${r.clientId}|${r.seatKey}`, {
      coverId: r.coverId,
      from: r.from.toISOString().slice(0, 10),
      to: r.to.toISOString().slice(0, 10),
    });
  }
  return out;
}

/**
 * Resolve one seat, given the covers already loaded.
 *
 * Takes the map rather than querying, so a caller shaping forty clients makes one
 * round trip instead of forty — the resolver being cheap is what stops callers
 * being tempted to skip it.
 */
export function resolveSeat(
  covers: Map<string, CoverWindow>,
  clientId: string,
  seatKey: string,
  ownerId: string | null,
  today = todayISO(),
): { staffId: string | null; coveredBy: string | null } {
  const cover = covers.get(`${clientId}|${seatKey}`);
  const staffId = staffForSeat(ownerId, cover ? [cover] : [], today);
  return { staffId, coveredBy: cover && staffId !== ownerId ? cover.coverId : null };
}

/**
 * The client ids somebody currently covers.
 *
 * Used by the scope clause, which is a Prisma WHERE and therefore cannot call a
 * function per row — it needs the answer as a list.
 */
export async function clientsCoveredBy(staffId: string, today = todayISO()): Promise<string[]> {
  const day = new Date(`${today}T00:00:00.000Z`);
  const rows = await prisma.podCover.findMany({
    where: { coverId: staffId, from: { lte: day }, to: { gte: day } },
    select: { clientId: true },
  });
  return [...new Set(rows.map((r) => r.clientId))];
}
