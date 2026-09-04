import type { Prisma } from '@prisma/client';
import { PILLARS, POD_SEATS, ROLES, pillarForRole, roleTitle, type schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import * as audit from './audit.service.js';
import { postMessage } from './circle.service.js';
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
      /*
       * The header's own readings, which the roster cards already store and the
       * record was not being sent.
       *
       * `sessions` is the per-pillar ledger the three rings draw (done / target);
       * `risk` + `riskWhy` are the "Gentle watch" chip and the sentence behind
       * it, which travel together because a warning nobody can act on is worse
       * than none; `anniv` is the SECOND celebration date — dob alone gives
       * birthdays and silently drops every anniversary from the header strip.
       */
      risk: true,
      riskWhy: true,
      anniv: true,
      compliance: true,
      lastCycleIndex: true,
      sessions: true,
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
/**
 * A calendar date, as a calendar date.
 *
 * `dob`, `anniv` and `onboardedAt` are DAYS, not instants — a birthday has no
 * time of day. The seed writes them with `new Date(y, m - 1, d)`, which is local
 * midnight, and Postgres stores that as the equivalent UTC instant: in
 * Asia/Kolkata a 31 August birthday lands as `1980-08-30T18:30:00Z`. A reader
 * that takes the first ten characters of the ISO string gets the 30th, and the
 * record quietly shows every client's birthday a day early.
 *
 * So the conversion happens HERE, once, in the timezone the row was written in —
 * rather than in each of the readers, where getting it right would be a thing to
 * remember and getting it wrong is invisible until somebody notices their own
 * date of birth is off.
 */
function dateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shapeClient<T extends { pod: Array<{ seat: string; staffId: string | null; staff: unknown }> }>(
  row: T,
) {
  const bySeat = new Map(row.pod.map((p) => [p.seat, p]));
  const pod = POD_SEATS.map((seat) => {
    const held = bySeat.get(seat);
    return {
      seat,
      staffId: held ? seatHolder(held) : null,
      /* filled by the caller from the cover map — the pod shaper runs per client
         and must not query covers per row */
      coveredBy: null as string | null,
      staff: held?.staff ?? null,
      /* the AI is not a person on the bench — it is what an empty seat looks
         like, and saying so here keeps every renderer from re-deriving it */
      ai: !held?.staffId,
    };
  });
  /* the three calendar dates, converted once — see `dateOnly` */
  const cal = row as unknown as { dob?: Date | null; anniv?: Date | null; onboardedAt?: Date | null };
  return {
    ...row,
    pod,
    ...('dob' in cal ? { dob: dateOnly(cal.dob) } : {}),
    ...('anniv' in cal ? { anniv: dateOnly(cal.anniv) } : {}),
    ...('onboardedAt' in cal ? { onboardedAt: dateOnly(cal.onboardedAt) } : {}),
  };
}

/**
 * Assign a coach to a seat, or hand it back to the AI.
 *
 * Three things are enforced here rather than in the UI. First, the staff member
 * has to exist and be active — a seat pointing at a dismissed employee is worse
 * than an empty one, because the screen shows a name and nobody notices. Second,
 * the whole act is recorded with a reason: "who put this coach on this client"
 * is a question with a six-month half-life, and replacing a human is not allowed
 * without one. Third, a change that lands is announced — see
 * `announceSeatChange`.
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

  /*
   * A REASON IS OWED WHEN A HUMAN IS BEING REPLACED, and only then.
   *
   * Taking a client off a coach is feedback about that coach, and the audit row
   * and the pod's thread are the only two places it is ever written down — both
   * of which stay blank unless somebody is asked. Filling an empty or AI seat
   * replaces nobody, so there is nothing to explain and the field stays optional
   * there; making it required everywhere would only teach people to type "x".
   *
   * The condition depends on the row already in the database, which is why it
   * cannot live in `assignPodSeatSchema` — that schema checks the SHAPE of a
   * reason (4–500 characters), this checks whether one is due.
   */
  const replacing = !!before?.staffId && before.staffId !== input.staffId;
  if (replacing && !input.reason?.trim()) {
    throw ApiError.badRequest('Say why this seat is changing hands.', {
      reason: 'Required when a coach is replaced',
    });
  }

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

  /*
   * Only when the seat ACTUALLY changed hands. Re-confirming the coach already
   * in the chair is not news, and announcing it would fill a client's thread
   * with lines saying nothing happened.
   *
   * `?? null` is load-bearing: a seat nobody has ever touched has NO ROW, so
   * `before` is null and `before?.staffId` is `undefined` — which is not `null`,
   * and the raw comparison would announce "Your AI coach → Your AI coach" every
   * time somebody handed an already-AI seat back to the AI.
   */
  if ((before?.staffId ?? null) !== input.staffId) {
    await announceSeatChange(user, client, seat, before?.staffId ?? null, row.staff, input.reason);
  }

  return { seat: row.seat, staffId: row.staffId, staff: row.staff, ai: !row.staffId };
}

/**
 * The two acts the demo performs the moment a seat is confirmed
 * (`console-clients.js:assignSeatSheet`): a pod-private note in the client's own
 * thread, and a notice to the coach who just gained the seat.
 *
 * NOTHING IN HERE MAY UNDO THE SEAT. The assignment is the fact; this is the
 * courtesy that tells people about it. So the whole block is caught and logged
 * rather than thrown: a thread that will not take a message must not roll back
 * a decision Ops has already made and already audited.
 */
async function announceSeatChange(
  user: Scoper,
  client: { id: string; name: string },
  seat: string,
  fromStaffId: string | null,
  toStaff: { id: string; name: string } | null,
  reason?: string,
): Promise<void> {
  try {
    const label = seatLabel(seat);
    /* `Scoper` carries the id and the role, never the name — and the note is
       signed, so the name has to be read */
    const [actor, fromStaff] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
      fromStaffId
        ? prisma.user.findUnique({ where: { id: fromStaffId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    const actorName = actor?.name ?? 'Ops';
    /* an empty seat is not a gap, it is the AI holding it — the same pseudo-user
       `HV.staff()` invents for a missing id, named the same way */
    const fromName = fromStaff?.name ?? AI_COACH_NAME;
    const toName = toStaff?.name ?? AI_COACH_NAME;
    const why = reason?.trim();

    /*
     * TEAMONLY, which is the point rather than a detail. `circle.service` keeps
     * this lane out of the client's feed entirely and raises no unread for it,
     * and the reason a coach was changed is a judgement about a colleague — the
     * team needs it where they already talk about this client, and the client
     * must never read it.
     */
    await postMessage(client.id, {
      fromUserId: user.id,
      fromKind: 'STAFF',
      kind: 'TEAMONLY',
      text:
        `Pod change · ${label} seat: ${fromName} → ${toName} — assigned by ${actorName}` +
        (why ? `\nWhy: ${why}` : ''),
    });

    /*
     * The incoming coach hears they now hold the seat — and NOT why.
     *
     * The reason is feedback about the coach being replaced. It belongs in the
     * team thread and the audit row, where it is read as a staffing decision;
     * handed to the colleague who takes over it becomes a verdict on a peer
     * passed through a third party. The outgoing coach gets no notice at all,
     * as in the demo: "you were removed because…" is a conversation a human
     * owes them, not a push this feature should invent.
     */
    if (toStaff && toStaff.id !== user.id) {
      await prisma.notice.create({
        data: {
          toId: toStaff.id,
          kind: 'TASK',
          clientId: client.id,
          text: `You now hold ${client.name}’s ${label} seat — assigned by ${actorName}`,
        },
      });
    }
  } catch (err) {
    logger.error(
      { clientId: client.id, seat, err: (err as Error).message },
      'pod seat changed, but the thread note or the notice could not be written',
    );
  }
}

/** The demo's pseudo-user for an unheld seat (`HV.staff()`, core.js:1047). */
const AI_COACH_NAME = 'Your AI coach';

/**
 * The seat's DISPLAY name — the same words the console's Care Team card prints.
 *
 * Derived rather than re-listed: the four coach seats ARE pillars, so their
 * names come from `PILLARS` through the role→pillar map (`dietitian` reads
 * "Nutrition", `mind` reads "Mind Wellness" — the two places the seat key and
 * the display name disagree), and the support seats are role titles.
 *
 * `admin` is the one seat whose label is not its own role's title: on a client's
 * pod that chair is the lead client coach, which the console calls "Haalving
 * Coach" (`ROLES.opsmgr.title`), not "Super Admin".
 *
 * EXPORTED because the employee record prints the same words under each client a
 * coach carries (`people.service.getStaff`). A second copy of this over there
 * would be two places for `admin` to stop reading "Haalving Coach".
 */
export function seatLabel(seat: string): string {
  const pillar = pillarForRole(seat);
  if (pillar) return PILLARS[pillar].name;
  if (seat === 'admin') return ROLES.opsmgr.title;
  return roleTitle(seat);
}

async function isHodOf(staffId: string, seat: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: staffId }, select: { dept: true } });
  return !!u?.dept && u.dept === seat;
}
