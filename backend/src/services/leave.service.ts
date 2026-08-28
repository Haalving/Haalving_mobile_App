import type { Prisma } from '@prisma/client';
import {
  DEPTS,
  bench as benchOf,
  benchLoad,
  canWithdraw,
  conflicts as computeConflicts,
  expandRange,
  isHardClash,
  loadWords,
  nextStatusAfterResponse,
  overlaps,
  statusAfterPlan,
  whyNot,
  type Conflict,
  type LeaveStatus,
  type SchedTask,
  type SchedUser,
  type ScheduleTask,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import { todayISO } from '../utils/dates.js';
import * as audit from './audit.service.js';
import { activeCovers } from './covers.service.js';
import * as config from './config.service.js';

/**
 * Time & Cover — the team's clock.
 *
 * THE STATE MACHINE IS IN `@haalving/shared` and is only APPLIED here. This module
 * decides who may ask, gathers the world the machine needs, and writes what a
 * transition implies; it never works out a status of its own.
 *
 * The nine rules and where each lives:
 *   1 availability shape        -> schemas/common.ts (quarter hours, no overlap)
 *   2 apply: no self-overlap    -> `apply`
 *   3 the bench                 -> shared `bench`, fed by `benchMembers`
 *   4 board completeness+clash  -> `plan`
 *   5 accept/decline by a named cover, while ACCEPT -> `respond`
 *   6 approve/decline by the approver, while PENDING -> `requireApprover`
 *   7 team scope                -> `teamScope`
 *   8 approval writes covers + swaps, one transaction -> `approve`
 *   9 every refusal is audited  -> `deny`
 */

export interface Actor {
  id: string;
  role: string;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const asDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

async function deny(actor: Actor, what: string, subjectId: string | null, message: string): Promise<never> {
  await audit.record({
    actorId: actor.id,
    action: 'denied',
    subjectType: 'leave',
    subjectId,
    reason: what,
    meta: { role: actor.role },
  });
  throw ApiError.forbidden(message);
}

/* ------------------------------------------------------------- notices */

/**
 * The outbox — the port of `HV.notice`.
 *
 * Write side only. Home › Notices reads it later; what matters now is that every
 * notice this flow PROMISES is actually recorded rather than being a toast that
 * vanished with the tab.
 */
async function notify(
  toIds: string[],
  text: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const unique = [...new Set(toIds.filter(Boolean))];
  if (!unique.length) return;
  await tx.notice.createMany({
    data: unique.map((toId) => ({ toId, kind: 'LEAVE' as never, text })),
  });
}

/* --------------------------------------------------------- the config */

/* through config.service — it owns the cache, and Configuration's Service tab
   writes the same row */
async function approverRole(): Promise<string> {
  return (await config.getLeaveConfig()).approverRole;
}

export async function getConfig() {
  return config.getLeaveConfig();
}

export async function setConfig(actor: Actor, role: string) {
  if (!(await can(actor.role, 'manageConfig'))) {
    await deny(actor, 'leave.config', null, 'Not available for your role.');
  }
  const row = await prisma.leaveConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', approverRole: role },
    update: { approverRole: role },
  });
  /* live on the next read, not in thirty seconds */
  await config.invalidate(config.CACHE_KEYS.leave);
  await audit.record({
    actorId: actor.id,
    action: 'leave.config_changed',
    subjectType: 'config',
    subjectId: 'leave',
    meta: { approverRole: role },
  });
  return { approverRole: row.approverRole };
}

/** Everyone who could sign. */
async function approvers(): Promise<string[]> {
  const role = await approverRole();
  const rows = await prisma.user.findMany({
    where: { status: 'active', role: { not: 'client' } },
    select: { id: true, role: true },
  });
  const byPerm = await Promise.all(rows.map((u) => can(u.role as string, 'approveLeave')));
  return rows.filter((u, i) => (u.role as string) === role || byPerm[i]).map((u) => u.id);
}

/** RULE 6. */
async function requireApprover(actor: Actor, leaveId: string): Promise<void> {
  const role = await approverRole();
  if (actor.role === role || (await can(actor.role, 'approveLeave'))) return;
  await deny(actor, 'leave.approve', leaveId, 'Not available for your role.');
}

/** RULE 7. */
async function teamScope(actor: Actor): Promise<Prisma.LeaveWhereInput | null> {
  if (
    actor.role === 'opshead' ||
    actor.role === 'admin' ||
    (await can(actor.role, 'reassignLeave')) ||
    (await can(actor.role, 'seeAllClients'))
  ) {
    return {};
  }
  if (actor.role === 'hod') {
    const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { dept: true } });
    if (!me?.dept) return null;
    /* an HoD's queue is their own bench */
    return { staff: { OR: [{ dept: me.dept }, { role: me.dept as never }] } };
  }
  return null;
}

/* ------------------------------------------------------------ the seat */

/** The bench key a coach's seat belongs to — `hod` sits on its department's. */
function coachSeat(u: { role: string; dept?: string | null }): string | null {
  const k = u.role === 'hod' ? (u.dept ?? '') : u.role;
  return (DEPTS as Record<string, string>)[k] ? k : null;
}

async function benchMembers(applicantId: string) {
  const applicant = await prisma.user.findUnique({ where: { id: applicantId } });
  if (!applicant) throw ApiError.notFound('No such person.');
  const seat = coachSeat({ role: applicant.role as string, dept: applicant.dept as string | null });
  const dept = (applicant.dept as string | null) ?? seat;
  if (!dept) return { applicant, seat, members: [] as typeof applicant[] };

  /* the bench: the department's coaches plus its HoD */
  const members = await prisma.user.findMany({
    where: {
      status: 'active',
      OR: [{ role: dept as never }, { role: 'hod', dept: dept as never }],
    },
  });
  return { applicant, seat, members };
}

/** The HoD of the applicant's bench, or every Ops Head when there is none. */
async function boardOwners(applicantId: string): Promise<string[]> {
  const { applicant, seat } = await benchMembers(applicantId);
  const dept = (applicant.dept as string | null) ?? seat;
  if (dept) {
    const hod = await prisma.user.findFirst({
      where: { role: 'hod', dept: dept as never, status: 'active' },
      select: { id: true },
    });
    if (hod) return [hod.id];
  }
  const ops = await prisma.user.findMany({
    where: { role: 'opshead', status: 'active' },
    select: { id: true },
  });
  return ops.map((u) => u.id);
}

/* --------------------------------------------------- the world for conflicts */

async function schedWorldFor(dateISO: string) {
  const users = await prisma.user.findMany({
    where: { role: { not: 'client' } },
    select: { id: true, name: true, status: true, avail: true, role: true },
  });
  const schedUsers: SchedUser[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    ai: (u.role as string) === 'ai',
    inactive: u.status !== 'active',
    avail: (u.avail as SchedUser['avail']) ?? null,
  }));

  const approved = await prisma.leave.findMany({
    where: { status: 'APPROVED' },
    select: { staffId: true, from: true, to: true },
  });

  const [y, m, d] = dateISO.split('-').map(Number);
  const now = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);

  return {
    now,
    users: schedUsers,
    /* the leave windows conflicts.ts already knows how to read */
    leaves: approved.map((l) => ({
      staffId: l.staffId,
      status: 'approved',
      from: iso(l.from),
      to: iso(l.to),
    })),
  };
}

interface SessionOcc {
  taskId: string;
  date: string;
  startMin: number;
  durMin: number;
  title: string;
  clientId: string | null;
}

/**
 * Every non-rhythm session the applicant holds inside the window.
 *
 * NON-RHYTHM on purpose: a daily duty holds no capacity and needs nobody to take
 * it, so putting the rhythm bar on the cover board would ask somebody to accept
 * four reminders a day for three days.
 */
async function sessionsInWindow(staffId: string, from: string, to: string): Promise<SessionOcc[]> {
  const rows = await prisma.task.findMany({
    where: { assigneeIds: { has: staffId }, kind: { not: 'DUTY' } },
    include: { exceptions: true, dones: true },
  });

  const tasks: ScheduleTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind.toLowerCase() as ScheduleTask['kind'],
    clientId: t.clientId,
    date: iso(t.date),
    startMin: t.startMin,
    durMin: t.durMin,
    recurFreq: t.recurFreq.toLowerCase() as ScheduleTask['recurFreq'],
    recurUntil: t.recurUntil ? iso(t.recurUntil) : null,
    assigneeIds: t.assigneeIds,
    groupIds: t.groupIds,
    exceptions: t.exceptions.map((e) => ({
      date: iso(e.date),
      cancelled: e.cancelled,
      startMin: e.startMin,
      durMin: e.durMin,
      title: e.title,
      coachSwap: (e.coachSwap as { fromId: string; toId: string } | null) ?? null,
    })),
  }));

  return expandRange(tasks, from, to)
    /* after any swap already in force — a session somebody else has taken is not
       this applicant's to hand over again */
    .filter((o) => o.assigneeIds.includes(staffId))
    .map((o) => ({
      taskId: o.task.id,
      date: o.date,
      startMin: o.startMin,
      durMin: o.durMin,
      title: o.title,
      clientId: o.task.clientId ?? null,
    }));
}

/** Conflicts for one candidate against one occurrence. */
async function candidateConflicts(
  candidateId: string,
  occ: SessionOcc,
  world: Awaited<ReturnType<typeof schedWorldFor>>,
  dayTasks: SchedTask[],
): Promise<Conflict[]> {
  return computeConflicts([candidateId], 0, occ.startMin, occ.durMin, {
    now: world.now,
    users: world.users,
    leaves: world.leaves,
    tasks: dayTasks,
  });
}

/** Everything booked on one day, as rd-0 tasks conflicts.ts can read. */
async function dayTasksFor(dateISO: string): Promise<SchedTask[]> {
  const rows = await prisma.task.findMany({ include: { exceptions: true, dones: true } });
  const tasks: ScheduleTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind.toLowerCase() as ScheduleTask['kind'],
    date: iso(t.date),
    startMin: t.startMin,
    durMin: t.durMin,
    recurFreq: t.recurFreq.toLowerCase() as ScheduleTask['recurFreq'],
    recurUntil: t.recurUntil ? iso(t.recurUntil) : null,
    assigneeIds: t.assigneeIds,
    groupIds: t.groupIds,
    exceptions: t.exceptions.map((e) => ({
      date: iso(e.date),
      cancelled: e.cancelled,
      startMin: e.startMin,
      durMin: e.durMin,
      coachSwap: (e.coachSwap as { fromId: string; toId: string } | null) ?? null,
    })),
  }));

  return expandRange(tasks, dateISO, dateISO).map((o) => ({
    id: o.task.id,
    title: o.title,
    day: 0,
    start: o.startMin,
    dur: o.durMin,
    assignees: o.assigneeIds,
    recur: null,
    rhythm: o.task.kind === 'duty',
    allowOverlap: !!o.task.allowOverlap,
  }));
}

/* ------------------------------------------------------------- reading */

const LEAVE_INCLUDE = {
  staff: { select: { id: true, name: true, role: true, dept: true, level: true } },
  reallocations: {
    include: {
      client: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
    },
  },
  sessionCovers: { include: { to: { select: { id: true, name: true } } } },
  responses: { include: { user: { select: { id: true, name: true } } } },
  events: { include: { by: { select: { id: true, name: true } } }, orderBy: { at: 'asc' } },
} as const;

type LeaveRow = Prisma.LeaveGetPayload<{ include: typeof LEAVE_INCLUDE }>;

function shapeLeave(l: LeaveRow) {
  return {
    id: l.id,
    staffId: l.staffId,
    staff: l.staff,
    from: iso(l.from),
    to: iso(l.to),
    reason: l.reason,
    status: l.status as LeaveStatus,
    declineReason: l.declineReason,
    createdAt: l.createdAt.toISOString(),
    reallocations: l.reallocations.map((r) => ({
      clientId: r.clientId,
      clientName: r.client.name,
      seatKey: r.seatKey,
      toId: r.toId,
      toName: r.to.name,
    })),
    sessionCovers: l.sessionCovers.map((s) => ({
      taskId: s.taskId,
      date: iso(s.date),
      toId: s.toId,
      toName: s.to.name,
    })),
    responses: l.responses.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      state: r.state,
      at: r.at.toISOString(),
    })),
    events: l.events.map((e) => ({
      act: e.act,
      by: e.by ? { id: e.by.id, name: e.by.name } : null,
      at: e.at.toISOString(),
    })),
  };
}

export async function listMine(actor: Actor) {
  const mine = await prisma.leave.findMany({
    where: { staffId: actor.id },
    include: LEAVE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  /* the covers waiting on ME */
  const waiting = await prisma.leave.findMany({
    where: { status: 'ACCEPT', responses: { some: { userId: actor.id, state: 'PENDING' } } },
    include: LEAVE_INCLUDE,
  });

  const toAccept = [];
  for (const l of waiting) {
    const sessions = [];
    for (const sc of l.sessionCovers.filter((s) => s.toId === actor.id)) {
      const date = iso(sc.date);
      const world = await schedWorldFor(date);
      const dayTasks = await dayTasksFor(date);
      const task = await prisma.task.findUnique({ where: { id: sc.taskId } });
      if (!task) continue;
      const occ: SessionOcc = {
        taskId: sc.taskId,
        date,
        startMin: task.startMin,
        durMin: task.durMin,
        title: task.title,
        clientId: task.clientId,
      };
      const c = await candidateConflicts(actor.id, occ, world, dayTasks);
      sessions.push({ ...occ, conflicts: c, reason: whyNot(c) });
    }
    toAccept.push({ ...shapeLeave(l), sessions });
  }

  return { mine: mine.map(shapeLeave), toAccept };
}

/* -------------------------------------------------------------- apply */

export async function apply(actor: Actor, input: { from: string; to: string; reason: string }) {
  /* RULE 2: no overlap with the applicant's own undecided or approved leave */
  const existing = await prisma.leave.findMany({
    where: { staffId: actor.id, status: { in: ['REASSIGN', 'ACCEPT', 'PENDING', 'APPROVED'] } },
    select: { from: true, to: true, status: true },
  });
  const clash = existing.find((l) =>
    overlaps({ from: iso(l.from), to: iso(l.to) }, { from: input.from, to: input.to }),
  );
  if (clash) {
    throw ApiError.conflict(
      `You already have leave on file from ${iso(clash.from)} to ${iso(clash.to)}.`,
      { from: iso(clash.from), to: iso(clash.to), status: clash.status },
    );
  }

  const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } });

  const leave = await prisma.$transaction(async (tx) => {
    const row = await tx.leave.create({
      data: {
        staffId: actor.id,
        from: asDate(input.from),
        to: asDate(input.to),
        reason: input.reason,
        status: 'REASSIGN',
      },
    });
    await tx.leaveEvent.create({ data: { leaveId: row.id, act: 'APPLIED', byId: actor.id } });
    return row;
  });

  /* to the HoD, or to every Ops Head when the bench has none */
  await notify(
    await boardOwners(actor.id),
    `${me?.name ?? 'Somebody'} has applied for leave — the cover needs planning.`,
  );

  await audit.record({
    actorId: actor.id,
    action: 'leave.applied',
    subjectType: 'leave',
    subjectId: leave.id,
    meta: { from: input.from, to: input.to },
  });

  return { id: leave.id, status: leave.status };
}

export async function withdraw(actor: Actor, id: string) {
  const l = await prisma.leave.findUnique({ where: { id } });
  if (!l) throw ApiError.notFound('No such leave.');
  if (l.staffId !== actor.id) {
    await deny(actor, 'leave.withdraw', id, 'That application is not yours.');
  }
  if (!canWithdraw(l.status as LeaveStatus)) {
    throw ApiError.conflict('That leave has already been decided.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.leave.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    await tx.leaveEvent.create({ data: { leaveId: id, act: 'WITHDRAWN', byId: actor.id } });
  });

  return { id, status: 'WITHDRAWN' as LeaveStatus };
}

/* ------------------------------------------------------------ respond */

export async function respond(actor: Actor, id: string, accept: boolean) {
  const l = await prisma.leave.findUnique({ where: { id }, include: LEAVE_INCLUDE });
  if (!l) throw ApiError.notFound('No such leave.');

  /* RULE 5: only somebody named, and only while the covers are being asked */
  const mine = l.responses.find((r) => r.userId === actor.id);
  if (!mine) await deny(actor, 'leave.respond', id, 'You were not asked to cover this.');
  if (l.status !== 'ACCEPT') {
    throw ApiError.conflict('That plan is not waiting on covers.');
  }

  const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } });

  const responses: Record<string, 'PENDING' | 'ACCEPTED' | 'DECLINED'> = {};
  for (const r of l.responses) responses[r.userId] = r.state;
  responses[actor.id] = accept ? 'ACCEPTED' : 'DECLINED';

  const next = nextStatusAfterResponse(responses);

  await prisma.$transaction(async (tx) => {
    await tx.leaveCoverResponse.update({
      where: { leaveId_userId: { leaveId: id, userId: actor.id } },
      data: { state: accept ? 'ACCEPTED' : 'DECLINED', at: new Date() },
    });
    await tx.leaveEvent.create({
      data: { leaveId: id, act: accept ? 'COVER_ACCEPTED' : 'COVER_DECLINED', byId: actor.id },
    });
    await tx.leave.update({ where: { id }, data: { status: next as never } });
  });

  if (!accept) {
    await notify([l.staffId], `${me?.name ?? 'A cover'} cannot take the cover — back to the board.`);
    await notify(
      await boardOwners(l.staffId),
      `${me?.name ?? 'A cover'} declined the cover for ${l.staff.name} — re-plan it.`,
    );
  } else if (next === 'PENDING') {
    await notify(
      await approvers(),
      `${l.staff.name}’s cover plan is accepted in full — your signature is next.`,
    );
  }

  return { id, status: next };
}

/* --------------------------------------------------------- the board */

export async function board(actor: Actor, id: string) {
  const scope = await teamScope(actor);
  if (!scope) await deny(actor, 'leave.board', id, 'Not available for your role.');

  const l = await prisma.leave.findFirst({
    where: { AND: [scope as Prisma.LeaveWhereInput, { id }] },
    include: LEAVE_INCLUDE,
  });
  if (!l) throw ApiError.notFound('No such leave.');

  const from = iso(l.from);
  const to = iso(l.to);
  const { applicant, seat, members } = await benchMembers(l.staffId);

  /* the clients whose seat resolves to the applicant TODAY — cover-aware, so a
     seat already covered by somebody else is not offered again */
  const covers = await activeCovers();
  const seats = seat
    ? await prisma.podSeat.findMany({
        where: { seat: seat as never, staffId: l.staffId },
        include: { client: { select: { id: true, name: true } } },
      })
    : [];
  const riding = seats
    .filter((s) => {
      const c = covers.get(`${s.clientId}|${seat}`);
      return !c || c.coverId === l.staffId;
    })
    .map((s) => ({ clientId: s.clientId, clientName: s.client.name, seatKey: seat as string }));

  const sessions = await sessionsInWindow(l.staffId, from, to);

  const allLeaves = await prisma.leave.findMany({
    select: { staffId: true, status: true, from: true, to: true },
  });
  const benchList = benchOf(
    { id: applicant.id, name: applicant.name, role: applicant.role as string, dept: applicant.dept as string | null, level: applicant.level },
    members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role as string,
      dept: m.dept as string | null,
      level: m.level,
    })),
    allLeaves.map((x) => ({
      staffId: x.staffId,
      status: x.status as LeaveStatus,
      from: iso(x.from),
      to: iso(x.to),
    })),
    { from, to },
  );

  /* per candidate: how much of the window they could actually take, and why not
     for each session */
  const perDate = new Map<string, { world: Awaited<ReturnType<typeof schedWorldFor>>; tasks: SchedTask[] }>();
  for (const s of sessions) {
    if (!perDate.has(s.date)) {
      perDate.set(s.date, { world: await schedWorldFor(s.date), tasks: await dayTasksFor(s.date) });
    }
  }

  const candidates = [];
  for (const b of benchList) {
    const clashes: boolean[] = [];
    const reasons: Record<string, string> = {};
    for (const s of sessions) {
      const ctx = perDate.get(s.date)!;
      const c = await candidateConflicts(b.id, s, ctx.world, ctx.tasks);
      clashes.push(isHardClash(c));
      reasons[`${s.taskId}|${s.date}`] = whyNot(c);
    }
    const hod = b.role === 'hod';
    candidates.push({
      id: b.id,
      name: b.name,
      level: b.level ?? null,
      sameLevel: b.level === applicant.level,
      isHod: hod,
      loadWords: loadWords(benchLoad(clashes)),
      reasons,
    });
  }

  return {
    leave: shapeLeave(l),
    seatKey: seat,
    riding,
    sessions,
    bench: candidates,
  };
}

/* ------------------------------------------------------------- plan */

export async function plan(
  actor: Actor,
  id: string,
  input: {
    reallocations: Array<{ clientId: string; toId: string }>;
    sessions: Array<{ taskId: string; date: string; toId: string }>;
  },
) {
  const scope = await teamScope(actor);
  if (!scope) await deny(actor, 'leave.plan', id, 'Not available for your role.');

  const l = await prisma.leave.findFirst({
    where: { AND: [scope as Prisma.LeaveWhereInput, { id }] },
    include: LEAVE_INCLUDE,
  });
  if (!l) throw ApiError.notFound('No such leave.');
  if (l.status === 'APPROVED' || l.status === 'DECLINED' || l.status === 'WITHDRAWN') {
    throw ApiError.conflict('That leave has already been decided.');
  }

  const data = await board(actor, id);
  const benchIds = new Set(data.bench.map((b) => b.id));

  /* RULE 4a: a name for EVERY riding client and EVERY booked session */
  const missingSeat = data.riding.find(
    (r) => !input.reallocations.some((x) => x.clientId === r.clientId),
  );
  if (missingSeat) {
    throw ApiError.badRequest(`${missingSeat.clientName} still needs a name against their seat.`, {
      clientId: missingSeat.clientId,
    });
  }
  const missingSession = data.sessions.find(
    (s) => !input.sessions.some((x) => x.taskId === s.taskId && x.date === s.date),
  );
  if (missingSession) {
    throw ApiError.badRequest('Every booked session needs a name against it.', {
      taskId: missingSession.taskId,
      date: missingSession.date,
    });
  }

  /* RULE 4b: every name must be on the bench */
  for (const r of [...input.reallocations, ...input.sessions]) {
    if (!benchIds.has(r.toId)) {
      throw ApiError.badRequest('That person is not on the bench for this leave.', {
        toId: r.toId,
      });
    }
  }

  /*
   * RULE 4c: a busy or on-leave clash is REFUSED; outside declared hours is
   * allowed and merely reported. That asymmetry is the whole point — a coach
   * being double-booked is a fact, a coach being asked to start an hour early is
   * a conversation.
   */
  for (const s of input.sessions) {
    const occ = data.sessions.find((x) => x.taskId === s.taskId && x.date === s.date);
    if (!occ) continue;
    const world = await schedWorldFor(s.date);
    const tasks = await dayTasksFor(s.date);
    const c = await candidateConflicts(s.toId, occ, world, tasks);
    if (isHardClash(c)) {
      const who = data.bench.find((b) => b.id === s.toId)?.name ?? 'That person';
      throw new ApiError(409, 'COVER_CLASH', `${who} is ${whyNot(c)} at that time.`, {
        taskId: s.taskId,
        date: s.date,
        toId: s.toId,
        reason: whyNot(c),
      });
    }
  }

  const named = [...new Set([...input.reallocations, ...input.sessions].map((x) => x.toId))];
  const next = statusAfterPlan(named.length);
  const seatKey = data.seatKey ?? '';

  await prisma.$transaction(async (tx) => {
    /* the plan REPLACES any previous one — a half-answered board is not a plan,
       and leaving the old rows would leave old acceptances standing */
    await tx.leaveReallocation.deleteMany({ where: { leaveId: id } });
    await tx.leaveSessionCover.deleteMany({ where: { leaveId: id } });
    await tx.leaveCoverResponse.deleteMany({ where: { leaveId: id } });

    for (const r of input.reallocations) {
      await tx.leaveReallocation.create({
        data: { leaveId: id, clientId: r.clientId, seatKey, toId: r.toId },
      });
    }
    for (const s of input.sessions) {
      await tx.leaveSessionCover.create({
        data: { leaveId: id, taskId: s.taskId, date: asDate(s.date), toId: s.toId },
      });
    }
    for (const toId of named) {
      await tx.leaveCoverResponse.create({ data: { leaveId: id, userId: toId, state: 'PENDING' } });
    }
    await tx.leaveEvent.create({ data: { leaveId: id, act: 'REASSIGNED', byId: actor.id } });
    await tx.leave.update({ where: { id }, data: { status: next as never } });
  });

  for (const toId of named) {
    const count = input.sessions.filter((s) => s.toId === toId).length;
    await notify(
      [toId],
      `You have been asked to cover for ${l.staff.name} — ${count} booked session${count === 1 ? '' : 's'}. Accept or decline.`,
    );
  }
  if (next === 'PENDING') {
    await notify(await approvers(), `${l.staff.name}’s leave needs no cover — your signature is next.`);
  }

  return { id, status: next, named };
}

/* ---------------------------------------------------------- approvals */

export async function listApprovals(actor: Actor) {
  await requireApprover(actor, 'list');
  const [pending, decided] = await Promise.all([
    prisma.leave.findMany({ where: { status: 'PENDING' }, include: LEAVE_INCLUDE, orderBy: { createdAt: 'asc' } }),
    prisma.leave.findMany({
      where: { status: { in: ['APPROVED', 'DECLINED', 'WITHDRAWN'] } },
      include: LEAVE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: 25,
    }),
  ]);
  return { pending: pending.map(shapeLeave), decided: decided.map(shapeLeave) };
}

/**
 * RULE 8. One signature approves both halves.
 *
 * A PodCover per reallocation and a TaskException.coachSwap per OCCURRENCE — never
 * the series, because a leave covers three days of a daily session rather than the
 * standing arrangement. Both carry `leaveId`, so a later change can be traced to
 * the decision that made it.
 */
export async function approve(actor: Actor, id: string) {
  await requireApprover(actor, id);

  const l = await prisma.leave.findUnique({ where: { id }, include: LEAVE_INCLUDE });
  if (!l) throw ApiError.notFound('No such leave.');
  if (l.status !== 'PENDING') {
    throw ApiError.conflict('That leave is not waiting on a signature.');
  }

  const written = await prisma.$transaction(async (tx) => {
    const coverIds: string[] = [];

    for (const r of l.reallocations) {
      const row = await tx.podCover.create({
        data: {
          clientId: r.clientId,
          seatKey: r.seatKey,
          coverId: r.toId,
          from: l.from,
          to: l.to,
          leaveId: id,
        },
      });
      coverIds.push(row.id);
    }

    for (const s of l.sessionCovers) {
      const existing = await tx.taskException.findUnique({
        where: { taskId_date: { taskId: s.taskId, date: s.date } },
      });
      const swap = { fromId: l.staffId, toId: s.toId } as Prisma.InputJsonValue;
      if (existing) {
        await tx.taskException.update({
          where: { id: existing.id },
          data: { coachSwap: swap, leaveId: id },
        });
      } else {
        await tx.taskException.create({
          data: { taskId: s.taskId, date: s.date, coachSwap: swap, leaveId: id },
        });
      }
    }

    await tx.leaveEvent.create({ data: { leaveId: id, act: 'APPROVED', byId: actor.id } });
    await tx.leave.update({ where: { id }, data: { status: 'APPROVED' } });
    return coverIds;
  });

  await notify([l.staffId], `Your leave is approved — covers switch on ${iso(l.from)}.`);
  for (const r of l.responses) {
    const seats = l.reallocations.filter((x) => x.toId === r.userId).length;
    const sess = l.sessionCovers.filter((x) => x.toId === r.userId).length;
    await notify(
      [r.userId],
      `You are covering for ${l.staff.name} from ${iso(l.from)} — ${seats} seat${seats === 1 ? '' : 's'} and ${sess} session${sess === 1 ? '' : 's'}.`,
    );
  }

  await audit.record({
    actorId: actor.id,
    action: 'leave.approved',
    subjectType: 'leave',
    subjectId: id,
    meta: { covers: written.length, sessions: l.sessionCovers.length },
  });

  return { id, status: 'APPROVED' as LeaveStatus, coverIds: written };
}

export async function decline(actor: Actor, id: string, reason: string) {
  await requireApprover(actor, id);

  const l = await prisma.leave.findUnique({ where: { id }, include: LEAVE_INCLUDE });
  if (!l) throw ApiError.notFound('No such leave.');
  if (l.status !== 'PENDING') {
    throw ApiError.conflict('That leave is not waiting on a signature.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.leave.update({ where: { id }, data: { status: 'DECLINED', declineReason: reason } });
    await tx.leaveEvent.create({ data: { leaveId: id, act: 'DECLINED', byId: actor.id } });
  });

  await notify([l.staffId], `Your leave was declined — ${reason}`);
  return { id, status: 'DECLINED' as LeaveStatus };
}

/* -------------------------------------------------------------- team */

export async function listTeam(actor: Actor) {
  const scope = await teamScope(actor);
  if (!scope) await deny(actor, 'leave.team', null, 'Not available for your role.');

  const all = await prisma.leave.findMany({
    where: scope as Prisma.LeaveWhereInput,
    include: LEAVE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  const needsPlan = [];
  for (const l of all.filter((x) => x.status === 'REASSIGN')) {
    const data = await board(actor, l.id).catch(() => null);
    needsPlan.push({
      ...shapeLeave(l),
      ridingCount: data?.riding.length ?? 0,
      sessionCount: data?.sessions.length ?? 0,
    });
  }

  const today = todayISO();
  const running = await prisma.podCover.findMany({
    where: { from: { lte: asDate(today) }, to: { gte: asDate(today) } },
    include: {
      client: { select: { id: true, name: true } },
      cover: { select: { id: true, name: true } },
      leave: { select: { staff: { select: { name: true } } } },
    },
  });

  return {
    needsPlan,
    waiting: all
      .filter((l) => l.status === 'ACCEPT' || l.status === 'PENDING')
      .map((l) => ({
        ...shapeLeave(l),
        stillToAnswer: l.responses.filter((r) => r.state === 'PENDING').map((r) => r.user.name),
      })),
    runningToday: running.map((c) => ({
      id: c.id,
      coverName: c.cover.name,
      ownerName: c.leave?.staff.name ?? null,
      clientName: c.client.name,
      seatKey: c.seatKey,
      until: iso(c.to),
    })),
    decided: all.filter((l) =>
      ['APPROVED', 'DECLINED', 'WITHDRAWN'].includes(l.status as string),
    ).map(shapeLeave),
  };
}
