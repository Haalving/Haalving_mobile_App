import type { Prisma } from '@prisma/client';

import { can } from '../middleware/authorize.js';
import { prisma } from '../config/prisma.js';
import { clientsCoveredBy } from './covers.service.js';

/**
 * WHO MAY SEE WHICH CLIENTS — the port of `HV.myClients` (core.js:1049).
 *
 * The demo's rule, in its own order, because the order is the rule:
 *
 *   1. a client sees their own record and nothing else
 *   2. `seeAllClients` sees every client
 *   3. an HoD (or anything holding `seeDeptClients`) sees the clients whose seat
 *      FOR THEIR DEPARTMENT is held by someone on that bench
 *   4. everyone else sees the clients on whose pod they hold a seat
 *
 * This is expressed as a Prisma WHERE FRAGMENT rather than a filter applied after
 * the query. That is not an optimisation: a scope applied in JavaScript has
 * already loaded the rows it is about to discard, so a bug in it leaks through
 * any code path that forgets to call it — a count, an export, a join. A where
 * clause cannot be forgotten by the query it is part of.
 *
 * COVER-AWARENESS is the one piece not yet here. In the demo `HV.staffFor`
 * resolves through `podCover`, so while Sneha is on approved leave her seat
 * belongs to Divya and every screen agrees. Day 1 has no leave board and no
 * PodCover table, so `seatHolder()` below is the seam where that resolution will
 * go — one function, so it lands in every caller at once.
 */

/** The bench for a department: its coaches plus its HoD. `HV.deptMembers`. */
export async function deptMembers(dept: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      status: 'active',
      OR: [
        { role: dept as never },
        { role: 'hod', dept: dept as never },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Who actually holds this seat today.
 *
 * THE SEAM IS NOW WIRED. This was a passthrough on Day 1 with a note saying an
 * active cover would resolve here; `covers.service.resolveSeat` is that
 * resolution, and callers shaping more than one client should use it directly so
 * the covers are loaded once rather than per row.
 *
 * Kept as a synchronous fallback for the single-seat case where no cover map is
 * to hand — it answers the OWNER, which is right whenever no cover is running and
 * is the safe direction to be wrong in for the moment one is.
 */
export function seatHolder(seat: { staffId: string | null }): string | null {
  return seat.staffId;
}

export interface Scoper {
  id: string;
  role: string;
  dept?: string | null;
  clientId?: string | undefined;
}

/**
 * The WHERE fragment for "the clients this person may see".
 *
 * Returns a clause that matches NOTHING (`{ id: { in: [] } }`) rather than `{}`
 * when a caller qualifies for no rule. An empty object here would mean "no
 * filter", i.e. every client in the database — the single most dangerous default
 * an access function can have.
 */
export async function clientScopeWhere(user: Scoper): Promise<Prisma.ClientWhereInput> {
  if (user.role === 'client') {
    return user.clientId ? { id: user.clientId } : { id: { in: [] } };
  }

  if (await can(user.role, 'seeAllClients')) {
    return {};
  }

  if ((user.role === 'hod' || (await can(user.role, 'seeDeptClients'))) && user.dept) {
    const bench = await deptMembers(user.dept);
    if (!bench.length) return { id: { in: [] } };
    /* the seat FOR THEIR DEPARTMENT, held by anyone on the bench — an HoD sees
       their department's book of work, not only their own clients */
    return { pod: { some: { seat: user.dept as never, staffId: { in: bench } } } };
  }

  /*
   * A coach sees the clients on whose pod they sit, whichever seat that is — AND
   * the clients whose seat they are covering today.
   *
   * A UNION, not a replacement. The owner keeps their people while they are away:
   * they are coming back, the record is still theirs to read, and taking the list
   * away would mean somebody returning from three days' leave could not see what
   * happened while they were gone. The cover simply gains access for the window.
   */
  const covered = await clientsCoveredBy(user.id);
  const own: Prisma.ClientWhereInput = { pod: { some: { staffId: user.id } } };
  return covered.length ? { OR: [own, { id: { in: covered } }] } : own;
}

/** Load the caller's department, which the scope rule needs and the token lacks. */
export async function loadScoper(user: { id: string; role: string; clientId?: string }): Promise<Scoper> {
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { dept: true },
  });
  return {
    id: user.id,
    role: user.role,
    dept: row?.dept ?? null,
    clientId: user.clientId,
  };
}

/**
 * May this person see this one client? Asked as a scoped COUNT rather than by
 * loading the client and comparing — so the answer comes from the same clause
 * the list endpoint uses and the two can never disagree.
 */
export async function canSeeClient(user: Scoper, clientId: string): Promise<boolean> {
  const where = await clientScopeWhere(user);
  const hit = await prisma.client.count({ where: { AND: [where, { id: clientId }] } });
  return hit > 0;
}
