import type { Prisma } from '@prisma/client';
import { POD_SEATS, type schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import { canSeeClient, clientScopeWhere, seatHolder, type Scoper } from './scope.service.js';

type ListClientsQuery = z.infer<typeof schemas.listClientsQuery>;
type AssignPodSeatInput = z.infer<typeof schemas.assignPodSeatSchema>;

/**
 * The client record, always read through the caller's scope.
 *
 * There is no unscoped read in this file. Every query composes the scope clause,
 * so a route that forgets to check permissions still cannot return a client the
 * caller may not see.
 */

const clientList = {
  id: true,
  name: true,
  code: true,
  plan: true,
  cycle: true,
  cycleDay: true,
  levels: true,
  humanPillars: true,
  track: true,
  observation: true,
  status: true,
  tier: true,
  location: true,
  userId: true,
  pod: {
    select: {
      seat: true,
      staffId: true,
      staff: { select: { id: true, name: true, role: true } },
    },
  },
} satisfies Prisma.ClientSelect;

export async function list(user: Scoper, q: ListClientsQuery) {
  const scope = await clientScopeWhere(user);

  const filters: Prisma.ClientWhereInput = {
    ...(q.plan ? { plan: q.plan === 'poorna' ? 'POORNA' : 'SVAYAM' } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.staffId ? { pod: { some: { staffId: q.staffId } } } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { code: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const rows = await prisma.client.findMany({
    where: { AND: [scope, filters] },
    select: clientList,
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  return rows.map(shapeClient);
}

export async function get(user: Scoper, id: string) {
  const scope = await clientScopeWhere(user);
  const row = await prisma.client.findFirst({
    where: { AND: [scope, { id }] },
    select: {
      ...clientList,
      designation: true,
      sex: true,
      dob: true,
      heightCm: true,
      weightKg: true,
      health: true,
      gender: true,
      address: true,
      email: true,
      phone: true,
      goal: true,
      purpose: true,
      tzo: true,
      tzLabel: true,
      termDays: true,
      termStart: true,
      statusWhy: true,
      onboardedAt: true,
      createdAt: true,
      user: { select: { id: true, phone: true, status: true } },
      /* the arrival this client was promoted from, when there was one — the
         record of how they got here, which the old PipelineCard row used to hold */
      arrival: { select: { id: true, step: true, arrivedAt: true, note: true } },
    },
  });

  /**
   * 404, not 403, for a client outside the caller's scope.
   *
   * A 403 would confirm the record EXISTS, which is itself the sensitive fact:
   * "is this person a member of a health programme" is answerable by probing ids
   * if the two responses differ. Not-found is the honest answer to "show me a
   * client", because as far as this caller's world goes, there is none.
   */
  if (!row) throw ApiError.notFound('No such client.');
  return shapeClient(row);
}

/**
 * Fill in the seats nobody holds.
 *
 * `staffId: null` is a REAL value meaning the AI holds the seat, and the demo
 * leans on it: `HV.staff()` returns an AI pseudo-user for a missing id, so an
 * unfilled pillar renders as the AI without any screen special-casing it. On a
 * Svayam client the pod is deliberately sparse, so most seats come back this way.
 */
function shapeClient<T extends { pod: Array<{ seat: string; staffId: string | null; staff: unknown }> }>(
  row: T,
) {
  const bySeat = new Map(row.pod.map((p) => [p.seat, p]));
  const pod = POD_SEATS.map((seat) => {
    const held = bySeat.get(seat);
    return {
      seat,
      staffId: held ? seatHolder(held) : null,
      staff: held?.staff ?? null,
      /* the AI is not a person on the bench — it is what an empty seat looks
         like, and saying so here keeps every renderer from re-deriving it */
      ai: !held?.staffId,
    };
  });
  return { ...row, pod };
}

/**
 * Assign a coach to a seat, or hand it back to the AI.
 *
 * Two things are enforced here rather than in the UI. First, the staff member has
 * to exist and be active — a seat pointing at a dismissed employee is worse than
 * an empty one, because the screen shows a name and nobody notices. Second, the
 * whole act is recorded with a reason: "who put this coach on this client" is a
 * question with a six-month half-life.
 */
export async function assignPodSeat(
  user: Scoper,
  clientId: string,
  seat: string,
  input: AssignPodSeatInput,
  ip?: string,
) {
  if (!(await canSeeClient(user, clientId))) throw ApiError.notFound('No such client.');

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, plan: true },
  });
  if (!client) throw ApiError.notFound('No such client.');

  if (input.staffId) {
    const staff = await prisma.user.findUnique({
      where: { id: input.staffId },
      select: { id: true, name: true, role: true, status: true },
    });
    if (!staff) throw ApiError.badRequest('No such person.', { staffId: 'Not found' });
    if (staff.status !== 'active') {
      throw ApiError.badRequest('That person is no longer active.', { staffId: 'Inactive' });
    }
    /* the seat names a ROLE, so the person taking it has to hold that role —
       or lead the bench it belongs to. Anything else puts a yoga teacher in the
       dietitian's seat and every screen downstream believes it. */
    const fits =
      staff.role === seat ||
      (staff.role === 'hod' && (await isHodOf(input.staffId, seat))) ||
      seat === 'admin' ||
      seat === 'opshead';
    if (!fits) {
      throw ApiError.badRequest(`${staff.name} does not hold that seat's role.`, {
        staffId: 'Wrong role for this seat',
      });
    }
  }

  const before = await prisma.podSeat.findUnique({
    where: { clientId_seat: { clientId, seat: seat as never } },
    select: { staffId: true },
  });

  const row = await prisma.podSeat.upsert({
    where: { clientId_seat: { clientId, seat: seat as never } },
    create: { clientId, seat: seat as never, staffId: input.staffId, assignedBy: user.id },
    update: { staffId: input.staffId, assignedBy: user.id, assignedAt: new Date() },
    include: { staff: { select: { id: true, name: true, role: true } } },
  });

  await audit.record({
    actorId: user.id,
    action: input.staffId ? 'pod.assign' : 'pod.clear',
    subjectType: 'client',
    subjectId: clientId,
    reason: input.reason ?? null,
    meta: {
      seat,
      from: before?.staffId ?? null,
      to: input.staffId,
      clientName: client.name,
    },
    ip: ip ?? null,
  });

  return { seat: row.seat, staffId: row.staffId, staff: row.staff, ai: !row.staffId };
}

async function isHodOf(staffId: string, seat: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: staffId }, select: { dept: true } });
  return !!u?.dept && u.dept === seat;
}
