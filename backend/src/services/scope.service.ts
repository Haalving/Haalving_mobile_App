import type { Prisma } from '@prisma/client';

import { can } from '../middleware/authorize.js';
import { prisma } from '../config/prisma.js';

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
 * Today that is simply the seat's staff. When the leave board lands, an active
 * cover is resolved HERE and every caller inherits it — which is exactly how the
 * demo avoids the bug where a cover moved the seat but the appointment kept the
 * absent coach's name.
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

  /* a coach sees the clients on whose pod they sit, whichever seat that is */
  return { pod: { some: { staffId: user.id } } };
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
