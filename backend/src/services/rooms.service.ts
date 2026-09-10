import type { MessageFromKind } from '@prisma/client';
import { stepDef } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import * as arrivals from './arrivals.service.js';
import { clientScopeWhere, type Scoper } from './scope.service.js';

/**
 * THE ROOMS — every conversation this person is part of, newest word first.
 *
 * Two kinds of room, one list. A CLIENT's care circle (`CircleMessage`) and an
 * ONBOARDING person's thread (`ArrivalMessage`) are different tables for good
 * reasons (arrivals.service.ts says why at length), but to the person answering
 * them they are the same thing: somebody wrote, and it is their turn. So the
 * list mixes both and orders by the newest line, whichever room it fell in.
 *
 * SCOPE IS THE SAME SCOPE AS EVERYWHERE. A client room is listed for whoever
 * `clientScopeWhere` lets see the client — the pod, a head of department's
 * bench, a see-all seat. An onboarding room is listed for whoever runs the
 * onboarding desk, exactly as the rail is; a coach seated on an arrival is
 * refused the rail and is refused the room for the same reason.
 *
 * THE CALL LIGHT, NOT A READ RECEIPT. There is no per-staff read pointer on a
 * circle (CircleRead is the client's own), so "unread" cannot be honest here.
 * What can be is WHOSE TURN IT IS: a room is lit when the person's newest line
 * sits after the newest answer in the lane they can see. That is what a desk
 * wants from an inbox — not "have I looked", but "am I owed a reply".
 */

export interface RoomLast {
  text: string;
  /** ISO — the row prints "X ago" from it and the list is ordered by it. */
  at: string;
  fromKind: MessageFromKind;
  /** The staff author's name; null for the person themselves or an AI line. */
  from: string | null;
  /** `team` — a TEAMONLY line the client never sees. */
  lane: 'client' | 'team';
}

export interface RoomRow {
  /** `client:<id>` | `arrival:<id>` — unique across both kinds. */
  key: string;
  kind: 'client' | 'onboarding';
  id: string;
  name: string;
  plan: string;
  /** A client's status (`active`, `paused`…); an arrival's step label. */
  where: string;
  last: RoomLast | null;
  /** The person wrote last and nobody has answered. */
  lit: boolean;
}

export interface RoomsPage {
  rows: RoomRow[];
  /** How many rooms are lit — the badge. */
  lit: number;
}

/** Newest line first; rooms nobody has written in yet trail, by name. */
function byNewest(a: RoomRow, b: RoomRow): number {
  if (a.last && b.last) return b.last.at.localeCompare(a.last.at) || a.name.localeCompare(b.name);
  if (a.last) return -1;
  if (b.last) return 1;
  return a.name.localeCompare(b.name);
}

export async function list(user: Scoper): Promise<RoomsPage> {
  const [clientRooms, arrivalRooms] = await Promise.all([
    clientRoomsFor(user),
    arrivalRoomsFor(user),
  ]);
  const rows = [...clientRooms, ...arrivalRooms].sort(byNewest);
  return { rows, lit: rows.filter((r) => r.lit).length };
}

/* ------------------------------------------------------------ client rooms */

async function clientRoomsFor(user: Scoper): Promise<RoomRow[]> {
  const scope = await clientScopeWhere(user);
  const clients = await prisma.client.findMany({
    where: scope,
    select: { id: true, name: true, plan: true, status: true },
  });
  if (!clients.length) return [];
  const ids = clients.map((c) => c.id);

  /*
   * THE NEWEST LINE IN EACH ROOM, by its seq — one groupBy for the addresses,
   * one fetch for the rows. `seq` is per-client and monotonic, so the max seq IS
   * the newest line, and the (clientId, seq) pair is a unique key.
   */
  const [tops, asked, answered] = await Promise.all([
    prisma.circleMessage.groupBy({
      by: ['clientId'],
      where: { clientId: { in: ids } },
      _max: { seq: true },
    }),
    /* the person's newest line… */
    prisma.circleMessage.groupBy({
      by: ['clientId'],
      where: { clientId: { in: ids }, fromKind: 'CLIENT' },
      _max: { seq: true },
    }),
    /* …against the newest answer they can see — a team-only note is not a reply */
    prisma.circleMessage.groupBy({
      by: ['clientId'],
      where: { clientId: { in: ids }, fromKind: { not: 'CLIENT' }, kind: { not: 'TEAMONLY' } },
      _max: { seq: true },
    }),
  ]);

  const lastRows = tops.length
    ? await prisma.circleMessage.findMany({
        where: { OR: tops.map((t) => ({ clientId: t.clientId, seq: t._max.seq ?? 0 })) },
        select: {
          clientId: true,
          kind: true,
          fromKind: true,
          text: true,
          createdAt: true,
          fromUser: { select: { name: true } },
        },
      })
    : [];
  const last = new Map(lastRows.map((m) => [m.clientId, m]));
  const askedAt = new Map(asked.map((t) => [t.clientId, t._max.seq ?? 0]));
  const answeredAt = new Map(answered.map((t) => [t.clientId, t._max.seq ?? 0]));

  return clients.map((c) => {
    const m = last.get(c.id);
    return {
      key: `client:${c.id}`,
      kind: 'client',
      id: c.id,
      name: c.name,
      plan: c.plan,
      where: c.status,
      last: m
        ? {
            text: m.text,
            at: m.createdAt.toISOString(),
            fromKind: m.fromKind,
            from: m.fromUser?.name ?? null,
            lane: m.kind === 'TEAMONLY' ? 'team' : 'client',
          }
        : null,
      lit: (askedAt.get(c.id) ?? 0) > (answeredAt.get(c.id) ?? 0),
    };
  });
}

/* -------------------------------------------------------- onboarding rooms */

async function arrivalRoomsFor(user: Scoper): Promise<RoomRow[]> {
  /* the onboarding desk is one desk — see arrivals.service.list */
  if (!(await arrivals.canRun(user))) return [];

  const active = await prisma.arrival.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, plan: true, step: true },
  });
  if (!active.length) return [];
  const ids = active.map((a) => a.id);

  const [tops, asked, answered] = await Promise.all([
    prisma.arrivalMessage.groupBy({
      by: ['arrivalId'],
      where: { arrivalId: { in: ids } },
      _max: { seq: true },
    }),
    prisma.arrivalMessage.groupBy({
      by: ['arrivalId'],
      where: { arrivalId: { in: ids }, fromKind: 'CLIENT' },
      _max: { seq: true },
    }),
    prisma.arrivalMessage.groupBy({
      by: ['arrivalId'],
      where: { arrivalId: { in: ids }, fromKind: { not: 'CLIENT' } },
      _max: { seq: true },
    }),
  ]);

  const lastRows = tops.length
    ? await prisma.arrivalMessage.findMany({
        where: { OR: tops.map((t) => ({ arrivalId: t.arrivalId, seq: t._max.seq ?? 0 })) },
        select: {
          arrivalId: true,
          fromKind: true,
          text: true,
          createdAt: true,
          fromUser: { select: { name: true } },
        },
      })
    : [];
  const last = new Map(lastRows.map((m) => [m.arrivalId, m]));
  const askedAt = new Map(asked.map((t) => [t.arrivalId, t._max.seq ?? 0]));
  const answeredAt = new Map(answered.map((t) => [t.arrivalId, t._max.seq ?? 0]));

  return active.map((a) => {
    const m = last.get(a.id);
    return {
      key: `arrival:${a.id}`,
      kind: 'onboarding',
      id: a.id,
      name: a.name,
      plan: a.plan,
      where: stepDef(a.step).label,
      last: m
        ? {
            text: m.text,
            at: m.createdAt.toISOString(),
            fromKind: m.fromKind,
            from: m.fromUser?.name ?? null,
            lane: 'client',
          }
        : null,
      lit: (askedAt.get(a.id) ?? 0) > (answeredAt.get(a.id) ?? 0),
    };
  });
}
