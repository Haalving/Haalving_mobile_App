import type { Prisma } from '@prisma/client';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  WD,
  addDays,
  availWindows,
  blockWords,
  conflicts as computeConflicts,
  dayNumber,
  expandRange,
  isGroupTask,
  isoOfDayNumber,
  layoutLanes,
  occursOnDate,
  pillarForRole,
  respSummary,
  weekdayOf,
  whoIndex,
  type Conflict,
  type SchedTask,
  type SchedUser,
  type ScheduleOccurrence,
  type ScheduleTask,
  type RespState,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import * as groups from './groups.service.js';

/**
 * The team's working calendar.
 *
 * EVERY RULE IS ENFORCED HERE. The console draws a refusal it was handed; it
 * never decides one. That is why the task sheet's live clash line comes from a
 * dry run of this same code rather than a second implementation in the browser —
 * the sentence a coach reads while typing and the rule that stops them cannot
 * disagree if there is only one of them.
 *
 * The eight rules and where each lives:
 *   1 overlap opt-in, both sides   -> `checkConflicts`, via conflicts.ts
 *   2 hours bind assignees only    -> `hoursFor` in `dayWorld`
 *   3 rhythm holds no capacity     -> `rhythm: true` on DUTY in `dayWorld`
 *   4 group tasks need acceptance  -> `respond`, and `respSummary` on read
 *   5 the lens                     -> `lensFor`
 *   6 editing                      -> `canEdit`
 *   7 recurrence expands on read   -> `expandRange`, `TaskException`
 *   8 sessions carry the pillar    -> `pillarForRole` at create
 */

export interface Actor {
  id: string;
  role: string;
}

const isAllocator = (a: Actor) => can(a.role, 'allocate');

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const asDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/* ------------------------------------------------------------- refusals */

async function deny(actor: Actor, what: string, subjectId: string | null, message: string): Promise<never> {
  await audit.record({
    actorId: actor.id,
    action: 'schedule.denied',
    subjectType: 'task',
    subjectId,
    reason: what,
    meta: { role: actor.role },
  });
  throw ApiError.forbidden(message);
}

/* --------------------------------------------------------- reading tasks */

type TaskRow = Prisma.TaskGetPayload<{
  include: { exceptions: true; dones: true; responses: true };
}>;

/**
 * A task that actually holds a slot.
 *
 * The three slot fields are nullable now — a Work Queue row has none — so the
 * calendar's helpers, which all take a date and a start minute, need to know
 * they are looking at booked time. This is a REAL PREDICATE rather than a cast:
 * `loadTasks` already filters the query, and if somebody later loosens that
 * filter this narrows the rows out instead of letting a null reach `iso()` and
 * throw halfway down the grid.
 */
type ScheduledRow = TaskRow & { date: Date; startMin: number; durMin: number };

function isScheduled(t: TaskRow): t is ScheduledRow {
  return t.date !== null && t.startMin !== null && t.durMin !== null;
}

/** The Prisma row as the shared helpers want it. */
function toScheduleTask(t: ScheduledRow): ScheduleTask {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind.toLowerCase() as ScheduleTask['kind'],
    clientId: t.clientId,
    pillar: t.pillar,
    date: iso(t.date),
    startMin: t.startMin,
    durMin: t.durMin,
    recurFreq: t.recurFreq.toLowerCase() as ScheduleTask['recurFreq'],
    recurUntil: t.recurUntil ? iso(t.recurUntil) : null,
    assigneeIds: t.assigneeIds,
    groupIds: t.groupIds,
    link: t.link,
    notes: t.notes,
    allowOverlap: t.allowOverlap,
    exceptions: t.exceptions.map((e) => ({
      date: iso(e.date),
      cancelled: e.cancelled,
      startMin: e.startMin,
      durMin: e.durMin,
      title: e.title,
      link: e.link,
      notes: e.notes,
      coachSwap: (e.coachSwap as { fromId: string; toId: string } | null) ?? null,
    })),
    doneDates: t.dones.map((d) => iso(d.date)),
  };
}

const INCLUDE = { exceptions: true, dones: true, responses: true } as const;

/**
 * Every calendar read comes through here, and every one of them SKIPS
 * UNSCHEDULED WORK.
 *
 * A task may now have no time on it — that is what a Work Queue row is, and the
 * two live in one table so the two screens can never drift apart. But a row with
 * no `date` has nothing for the occurrence expander to expand: it would either
 * throw on a null or, worse, be silently placed at midnight on the epoch and
 * drawn as a tile nobody booked.
 *
 * The clause lives HERE rather than at each call site because there are two
 * callers today and there will be more, and a calendar that forgets it once
 * shows a phantom booking that no amount of reading the grid explains.
 */
async function loadTasks(where: Prisma.TaskWhereInput = {}): Promise<ScheduledRow[]> {
  const rows = await prisma.task.findMany({
    where: { ...where, date: { not: null } },
    include: INCLUDE,
  });
  /* the query already excludes them; this is what tells the compiler so, and
     what keeps the promise true if the query is ever edited */
  return rows.filter(isScheduled);
}

async function loadTask(id: string): Promise<TaskRow> {
  const t = await prisma.task.findUnique({ where: { id }, include: INCLUDE });
  if (!t) throw ApiError.notFound('No such task.');
  return t;
}

/* ------------------------------------------------------------- the world */

/**
 * The bridge between this module's real dates and conflicts.ts's `rd`.
 *
 * conflicts.ts counts days as offsets from `now`, and every question it answers
 * is inside ONE day. So the target date is handed to it as `now` and the day in
 * question is always rd 0 — the occurrences are pre-expanded here and passed in
 * as one-off tasks sitting on day 0.
 *
 * `now` is local MIDDAY rather than midnight: `wdOf` reads the weekday off it, and
 * midnight in a zone that shifts can land on the previous day.
 */
function dayWorld(
  dateISO: string,
  occs: ScheduleOccurrence[],
  users: SchedUser[],
  opts: { exceptIds?: string[]; allowOverlap?: boolean; hoursFor?: string[]; peopleOf?: Map<string, string[]> },
) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const now = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);

  const tasks: SchedTask[] = occs.map((o) => ({
    id: o.task.id,
    title: o.title,
    day: 0,
    start: o.startMin,
    dur: o.durMin,
    assignees: opts.peopleOf?.get(o.task.id) ?? o.assigneeIds,
    recur: null,
    /*
     * RULE 3. A daily duty is a standing to-do pinned to a nominal hour, not an
     * appointment: it holds no capacity and blocks none, in either direction.
     * Distinct from allowOverlap, which is two appointments agreeing to run side
     * by side and therefore needs both of them to say so.
     */
    rhythm: o.task.kind === 'duty',
    allowOverlap: !!o.task.allowOverlap,
  }));

  return {
    now,
    tasks,
    users,
    /* the Leave model does not exist yet. This is the seam: when the leave board
       lands, approved leaves overlapping the day are loaded here and every
       booking path inherits the refusal at once. */
    leaves: [],
    exceptIds: opts.exceptIds ?? [],
    allowOverlap: !!opts.allowOverlap,
    ...(opts.hoursFor ? { hoursFor: opts.hoursFor } : {}),
  };
}

async function schedUsers(): Promise<SchedUser[]> {
  const rows = await prisma.user.findMany({
    where: { role: { not: 'client' } },
    select: { id: true, name: true, status: true, avail: true, role: true },
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    /* the AI keeps no hours and cannot be double-booked. `ai` is a role in the
       RBAC matrix but not a STORABLE one, so no row can hold it today — the test
       is kept because conflicts.ts asks for the flag, and the day an AI seat
       becomes real this already answers correctly. */
    ai: (u.role as string) === 'ai',
    inactive: u.status !== 'active',
    avail: (u.avail as SchedUser['avail']) ?? null,
  }));
}

/**
 * Would this booking be refused?
 *
 * Called by every write path — the sheet, both drag gestures and an applied
 * proposal — because a rule enforced on three of four paths is not a rule.
 *
 * For a recurring task it checks the next 14 occurrences rather than only the
 * first: a series that clears Monday but lands on a coach's existing Thursday
 * session should be refused when it is created, not discovered a week later.
 */
export async function checkConflicts(input: {
  people: string[];
  assigneeIds: string[];
  dates: string[];
  startMin: number;
  durMin: number;
  allowOverlap: boolean;
  exceptTaskId?: string;
}): Promise<Conflict[]> {
  const users = await schedUsers();
  const out: Conflict[] = [];

  /* loaded ONCE, not per date: a recurring task is checked against fourteen days
     and this is the same board every time */
  const rows = await loadTasks({});
  const tasks = rows.map(toScheduleTask);
  const groupIds = [...new Set(tasks.flatMap((t) => t.groupIds))];
  const resolved = await groups.resolveMany(groupIds);
  const peopleOf = new Map(
    tasks.map((t) => [t.id, groups.peopleOfTask(t.assigneeIds, t.groupIds, resolved)]),
  );

  for (const date of input.dates) {
    const occs = expandRange(tasks, date, date);

    const found = computeConflicts(
      input.people,
      0,
      input.startMin,
      input.durMin,
      dayWorld(date, occs, users, {
        exceptIds: input.exceptTaskId ? [input.exceptTaskId] : [],
        allowOverlap: input.allowOverlap,
        /* RULE 2: declared hours bind the people NAMED on the task, not everyone
           a group drags in. Being busy or on leave binds everyone. */
        hoursFor: input.assigneeIds,
        peopleOf,
      }),
    );

    for (const c of found) {
      if (!out.some((x) => x.type === c.type && x.whoId === c.whoId && x.detail === c.detail)) {
        out.push(c);
      }
    }
  }

  return out;
}

/** The first 14 dates a task runs on, which is what a create/edit is checked against. */
function occurrenceDates(t: ScheduleTask, limit = 14): string[] {
  if (t.recurFreq === 'none') return [t.date];
  const out: string[] = [];
  let n = dayNumber(t.date);
  const end = t.recurUntil ? dayNumber(t.recurUntil) : n + 365;
  while (out.length < limit && n <= end) {
    const date = isoOfDayNumber(n);
    if (occursOnDate(t, date)) out.push(date);
    n += 1;
  }
  return out;
}

function refuse(found: Conflict[]): never {
  const first = found[0] as Conflict;
  throw new ApiError(409, 'SCHEDULE_CONFLICT', blockWords(first), {
    conflicts: found.map((c) => ({ type: c.type, who: c.who, whoId: c.whoId, detail: c.detail })),
  });
}

/* ---------------------------------------------------------------- lens */

/**
 * RULE 5. Everyone lands on their own schedule; widening it is an allocator's
 * privilege, ENFORCED HERE and not only in the sheet. A non-allocator asking for
 * somebody else's week is answered with their own rather than an error — the lens
 * is a view preference, and refusing the page because of one would be a strange
 * way to say "you can only see yourself".
 */
async function lensFor(actor: Actor, asked: string[]): Promise<string[]> {
  if (await isAllocator(actor)) return asked;
  return [actor.id];
}

/* --------------------------------------------------------------- canEdit */

/** RULE 6. An allocator edits anything; everyone else edits what binds them. */
async function canEdit(actor: Actor, t: TaskRow, people: string[]): Promise<boolean> {
  if (await isAllocator(actor)) return true;
  if (t.createdById === actor.id) return true;
  return people.includes(actor.id);
}

/* ----------------------------------------------------------------- list */

export interface ListQuery {
  from: string;
  to: string;
  people: string[];
  client?: string;
}

export async function list(actor: Actor, q: ListQuery) {
  const lens = await lensFor(actor, q.people);
  const allocator = await isAllocator(actor);

  const rows = await loadTasks(q.client ? { clientId: q.client } : {});
  const tasks = rows.map(toScheduleTask);

  const groupIds = [...new Set(tasks.flatMap((t) => t.groupIds))];
  const resolved = await groups.resolveMany(groupIds);
  const peopleOf = new Map(
    tasks.map((t) => [t.id, groups.peopleOfTask(t.assigneeIds, t.groupIds, resolved)]),
  );

  const responsesByTask = new Map<string, Record<string, RespState>>();
  for (const r of rows) {
    responsesByTask.set(
      r.id,
      Object.fromEntries(r.responses.map((x) => [x.userId, x.state.toLowerCase() as RespState])),
    );
  }

  /*
   * THE LENS IS AN OR, not an AND. A meeting the whole pod attends belongs on
   * every one of their grids; asking for the intersection would hide exactly the
   * shared work the calendar exists to show.
   *
   * An empty lens means everyone — but only an allocator can have one, because
   * `lensFor` has already narrowed anybody else to themselves.
   */
  const inLens = (taskId: string) =>
    lens.length === 0 || (peopleOf.get(taskId) ?? []).some((id) => lens.includes(id));

  const all = expandRange(tasks, q.from, q.to).filter((o) => inLens(o.task.id));

  /* the rhythm bar is its own band, so duties are lifted out of the grid */
  const gridOccs = all.filter((o) => o.task.kind !== 'duty');
  const dutyOccs = all.filter((o) => o.task.kind === 'duty');

  const byDay = new Map<string, ScheduleOccurrence[]>();
  for (const o of gridOccs) {
    const list = byDay.get(o.date) ?? [];
    list.push(o);
    byDay.set(o.date, list);
  }
  for (const [, occs] of byDay) layoutLanes(occs);

  const staffRows = await prisma.user.findMany({
    where: { role: { not: 'client' }, status: 'active' },
    select: { id: true, name: true, role: true, avail: true },
    orderBy: { name: 'asc' },
  });
  const staff = staffRows.map((u, i) => ({
    id: u.id,
    name: u.name,
    role: u.role as string,
    who: whoIndex(i),
  }));

  const shape = (o: ScheduleOccurrence) => {
    const people = peopleOf.get(o.task.id) ?? [];
    const responses = responsesByTask.get(o.task.id) ?? {};
    const summary = respSummary(people, responses);
    return {
      taskId: o.task.id,
      date: o.date,
      startMin: o.startMin,
      durMin: o.durMin,
      title: o.title,
      kind: o.task.kind,
      pillar: o.task.pillar ?? null,
      clientId: o.task.clientId ?? null,
      link: o.link,
      notes: o.notes,
      people,
      groups: o.task.groupIds,
      assigneeIds: o.assigneeIds,
      done: o.done,
      resp: {
        ...summary,
        /* a solo task is never "unconfirmed" — there is nobody to agree with */
        needed: isGroupTask({ groupIds: o.task.groupIds }, people),
      },
      mine: responses[actor.id] ?? null,
      editable: allocator || people.includes(actor.id),
      recurring: o.task.recurFreq !== 'none',
      edited: o.edited,
      lane: o.lane ?? 0,
      lanes: o.lanes ?? 1,
    };
  };

  /*
   * The hatching behind the grid: the visible hours OUTSIDE a person's declared
   * window. Computed per person per day and sent down, because it is the same
   * `availWindows` the refusal reads — the shading and the rule must agree.
   */
  const days: string[] = [];
  for (let n = dayNumber(q.from); n <= dayNumber(q.to); n++) days.push(isoOfDayNumber(n));

  const users = await schedUsers();
  const byId = new Map(users.map((u) => [u.id, u]));
  const offSegments: Record<string, Record<string, Array<[number, number]>>> = {};

  /* only for the people actually in the lens — hatching for the whole bench would
     be forty rows of shading nobody asked for */
  for (const personId of lens.length ? lens : []) {
    const u = byId.get(personId);
    if (!u || u.ai) continue;
    const perDay: Record<string, Array<[number, number]>> = {};
    for (const day of days) {
      const wins = availWindows(u, WD[weekdayOf(day)] as never);
      /* no declared window at all means the whole visible day is outside it —
         which is what a day off looks like, and it hatches solid */
      if (!wins.length) {
        perDay[day] = [[DAY_START_MIN, DAY_END_MIN]];
        continue;
      }
      /* A SPLIT shift leaves more than one gap — before the first window, between
         the windows, and after the last — so this walks the day's windows rather
         than a single from/to pair. */
      const segs: Array<[number, number]> = [];
      let cur = DAY_START_MIN;
      for (const w of wins) {
        if (w[0] > cur) segs.push([cur, Math.min(w[0], DAY_END_MIN)]);
        cur = Math.max(cur, w[1]);
      }
      if (cur < DAY_END_MIN) segs.push([cur, DAY_END_MIN]);
      perDay[day] = segs.filter((sg) => sg[1] > sg[0] && sg[0] < DAY_END_MIN);
    }
    offSegments[personId] = perDay;
  }

  return {
    from: q.from,
    to: q.to,
    lens,
    canWiden: allocator,
    days,
    occurrences: gridOccs.map(shape),
    dailies: dutyOccs.map(shape),
    staff,
    offSegments,
  };
}

/* --------------------------------------------------------------- create */

export interface CreateInput {
  title: string;
  kind: string;
  clientId?: string | null;
  date: string;
  startMin: number;
  durMin: number;
  recurFreq: string;
  recurUntil?: string | null;
  assigneeIds: string[];
  groupIds: string[];
  link?: string | null;
  notes?: string | null;
  allowOverlap: boolean;
}

/** Resolve the people a proposed task would bind, without writing anything. */
async function peopleFor(assigneeIds: string[], groupIds: string[]): Promise<string[]> {
  const resolved = await groups.resolveMany(groupIds);
  return groups.peopleOfTask(assigneeIds, groupIds, resolved);
}

export async function create(actor: Actor, input: CreateInput, opts: { dryRun?: boolean } = {}) {
  const people = await peopleFor(input.assigneeIds, input.groupIds);

  /* an allocator books for anybody; everybody else books only what they are on */
  if (!(await isAllocator(actor)) && !people.includes(actor.id)) {
    await deny(actor, 'schedule.create', null, 'You can only put yourself on the calendar.');
  }

  const draft: ScheduleTask = {
    id: '__new__',
    title: input.title,
    kind: input.kind as ScheduleTask['kind'],
    date: input.date,
    startMin: input.startMin,
    durMin: input.durMin,
    recurFreq: input.recurFreq as ScheduleTask['recurFreq'],
    recurUntil: input.recurUntil ?? null,
    assigneeIds: input.assigneeIds,
    groupIds: input.groupIds,
    allowOverlap: input.allowOverlap,
  };

  const found = await checkConflicts({
    people,
    assigneeIds: input.assigneeIds,
    dates: occurrenceDates(draft),
    startMin: input.startMin,
    durMin: input.durMin,
    allowOverlap: input.allowOverlap,
  });

  if (opts.dryRun) return { ok: found.length === 0, conflicts: found, people };
  if (found.length) refuse(found);

  /* RULE 8: a session carries the pillar of its coach's role, and that is the
     only place a pillar colour appears on this grid */
  let pillar: string | null = null;
  if (input.kind === 'session' && input.assigneeIds[0]) {
    const coach = await prisma.user.findUnique({
      where: { id: input.assigneeIds[0] },
      select: { role: true },
    });
    pillar = coach ? pillarForRole(coach.role as string) : null;
  }

  const t = await prisma.task.create({
    data: {
      title: input.title,
      kind: input.kind.toUpperCase() as never,
      clientId: input.clientId ?? null,
      pillar,
      date: asDate(input.date),
      startMin: input.startMin,
      durMin: input.durMin,
      recurFreq: input.recurFreq.toUpperCase() as never,
      recurUntil: input.recurUntil ? asDate(input.recurUntil) : null,
      assigneeIds: input.assigneeIds,
      groupIds: input.groupIds,
      link: input.link ?? null,
      notes: input.notes ?? null,
      allowOverlap: input.allowOverlap,
      createdById: actor.id,
    },
  });

  await audit.record({
    actorId: actor.id,
    action: 'task.created',
    subjectType: 'task',
    subjectId: t.id,
    meta: { title: t.title, kind: t.kind, date: input.date, people },
  });

  return { id: t.id, people };
}

/* ----------------------------------------------------------------- edit */

export async function edit(
  actor: Actor,
  id: string,
  input: Partial<CreateInput> & { scope: string; occurrenceDate?: string },
) {
  const row = await loadTask(id);
  const people = await peopleFor(row.assigneeIds, row.groupIds);
  if (!(await canEdit(actor, row, people))) {
    await deny(actor, 'schedule.edit', id, 'That task is not yours to change.');
  }

  /*
   * THE CALENDAR EDIT PATH NEEDS A SLOT.
   *
   * `Task` now holds Work Queue rows, which carry none. Everything below —
   * conflict checking, per-occurrence exceptions, the series anchor — is about
   * booked time, and a row with no time has nothing for it to move. Rather than
   * invent 00:00 and quietly place the row on the grid, this refuses with the
   * sentence that names what is missing.
   *
   * Giving a queue row a time IS a legitimate act; it just has to supply one.
   */
  const startMin = input.startMin ?? row.startMin;
  const durMin = input.durMin ?? row.durMin;
  if (startMin === null || durMin === null || (row.date === null && !input.date)) {
    throw ApiError.badRequest(
      'That task has no time on it yet. Give it a date and a start time to put it on the calendar.',
    );
  }

  const nextAssignees = input.assigneeIds ?? row.assigneeIds;
  const nextGroups = input.groupIds ?? row.groupIds;
  const nextPeople = await peopleFor(nextAssignees, nextGroups);

  if (input.scope === 'occurrence') {
    const date = input.occurrenceDate as string;
    const found = await checkConflicts({
      people: nextPeople,
      assigneeIds: nextAssignees,
      dates: [date],
      startMin,
      durMin,
      allowOverlap: input.allowOverlap ?? row.allowOverlap,
      exceptTaskId: id,
    });
    if (found.length) refuse(found);

    /* RULE 7: a per-occurrence change writes an exception for that date. The
       series stays one row and the change reads as "this Tuesday only". */
    const data = {
      startMin,
      durMin,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.link !== undefined ? { link: input.link } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    await prisma.taskException.upsert({
      where: { taskId_date: { taskId: id, date: asDate(date) } },
      create: { taskId: id, date: asDate(date), ...data },
      update: data,
    });
  } else {
    /* the guard above proved the slot exists; `row.date` is what it could not
       narrow through, so it is asserted here beside the check that earned it */
    const draft = toScheduleTask({ ...row, date: row.date as Date, startMin, durMin });
    const next: ScheduleTask = {
      ...draft,
      startMin,
      durMin,
      date: input.date ?? draft.date,
      recurFreq: (input.recurFreq as ScheduleTask['recurFreq']) ?? draft.recurFreq,
      recurUntil: input.recurUntil !== undefined ? input.recurUntil : draft.recurUntil,
      assigneeIds: nextAssignees,
      groupIds: nextGroups,
    };
    const found = await checkConflicts({
      people: nextPeople,
      assigneeIds: nextAssignees,
      dates: occurrenceDates(next),
      startMin,
      durMin,
      allowOverlap: input.allowOverlap ?? row.allowOverlap,
      exceptTaskId: id,
    });
    if (found.length) refuse(found);

    await prisma.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.kind !== undefined ? { kind: input.kind.toUpperCase() as never } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        ...(input.date !== undefined ? { date: asDate(input.date) } : {}),
        startMin,
        durMin,
        ...(input.recurFreq !== undefined
          ? { recurFreq: input.recurFreq.toUpperCase() as never }
          : {}),
        ...(input.recurUntil !== undefined
          ? { recurUntil: input.recurUntil ? asDate(input.recurUntil) : null }
          : {}),
        ...(input.assigneeIds !== undefined ? { assigneeIds: input.assigneeIds } : {}),
        ...(input.groupIds !== undefined ? { groupIds: input.groupIds } : {}),
        ...(input.link !== undefined ? { link: input.link } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.allowOverlap !== undefined ? { allowOverlap: input.allowOverlap } : {}),
      },
    });
  }

  await audit.record({
    actorId: actor.id,
    action: 'task.edited',
    subjectType: 'task',
    subjectId: id,
    meta: { scope: input.scope, date: input.occurrenceDate ?? null },
  });

  return { id };
}

/* ----------------------------------------------------------------- move */

/**
 * A drag, in one verb.
 *
 * Same day is a TIME CHANGE. A different day on one occurrence of a series is a
 * DETACH: that date is cancelled on the original and a standalone task is written
 * in its place, because a recurring task cannot have one of its occurrences
 * living on a different weekday without ceasing to be the pattern it claims.
 */
export async function move(
  actor: Actor,
  id: string,
  input: { fromDate: string; toDate: string; startMin: number; durMin: number; scope: string },
) {
  const row = await loadTask(id);
  const people = await peopleFor(row.assigneeIds, row.groupIds);
  if (!(await canEdit(actor, row, people))) {
    await deny(actor, 'schedule.move', id, 'That task is not yours to change.');
  }

  const found = await checkConflicts({
    people,
    assigneeIds: row.assigneeIds,
    dates: [input.toDate],
    startMin: input.startMin,
    durMin: input.durMin,
    allowOverlap: row.allowOverlap,
    exceptTaskId: id,
  });
  if (found.length) refuse(found);

  const recurring = row.recurFreq !== 'NONE';
  const sameDay = input.fromDate === input.toDate;

  if (!recurring) {
    await prisma.task.update({
      where: { id },
      data: { date: asDate(input.toDate), startMin: input.startMin, durMin: input.durMin },
    });
    return { id, detached: false };
  }

  if (input.scope === 'series') {
    /* the whole series slides: anchor AND bound move together, or earlier
       occurrences fall off the front and exception dates point at nothing */
    const delta = dayNumber(input.toDate) - dayNumber(input.fromDate);
    await shiftSeriesBy(id, delta, input.startMin, input.durMin);
    return { id, detached: false };
  }

  if (sameDay) {
    await prisma.taskException.upsert({
      where: { taskId_date: { taskId: id, date: asDate(input.toDate) } },
      create: {
        taskId: id,
        date: asDate(input.toDate),
        startMin: input.startMin,
        durMin: input.durMin,
      },
      update: { startMin: input.startMin, durMin: input.durMin },
    });
    return { id, detached: false };
  }

  /* cross-day on one occurrence — cancel it here, write it there */
  const created = await prisma.$transaction(async (tx) => {
    await tx.taskException.upsert({
      where: { taskId_date: { taskId: id, date: asDate(input.fromDate) } },
      create: { taskId: id, date: asDate(input.fromDate), cancelled: true },
      update: { cancelled: true },
    });
    return tx.task.create({
      data: {
        title: row.title,
        kind: row.kind,
        clientId: row.clientId,
        pillar: row.pillar,
        date: asDate(input.toDate),
        startMin: input.startMin,
        durMin: input.durMin,
        recurFreq: 'NONE',
        assigneeIds: row.assigneeIds,
        groupIds: row.groupIds,
        link: row.link,
        notes: row.notes,
        allowOverlap: row.allowOverlap,
        createdById: row.createdById,
      },
    });
  });

  await audit.record({
    actorId: actor.id,
    action: 'task.detached',
    subjectType: 'task',
    subjectId: id,
    meta: { from: input.fromDate, to: input.toDate, newTaskId: created.id },
  });

  return { id: created.id, detached: true };
}

async function shiftSeriesBy(id: string, delta: number, startMin?: number, durMin?: number) {
  const row = await loadTask(id);
  /* sliding a series by N days is a calendar act; a queue row has no anchor to
     slide and no occurrences to carry with it */
  if (!isScheduled(row)) {
    throw ApiError.badRequest('That task is not on the calendar, so there is nothing to shift.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: {
        date: asDate(addDays(iso(row.date), delta)),
        ...(row.recurUntil ? { recurUntil: asDate(addDays(iso(row.recurUntil), delta)) } : {}),
        ...(startMin !== undefined ? { startMin } : {}),
        ...(durMin !== undefined ? { durMin } : {}),
      },
    });
    /* exceptions and done marks travel with the series, or they would point at
       dates the series no longer runs on */
    for (const e of row.exceptions) {
      await tx.taskException.update({
        where: { id: e.id },
        data: { date: asDate(addDays(iso(e.date), delta)) },
      });
    }
    for (const d of row.dones) {
      await tx.taskDone.update({
        where: { id: d.id },
        data: { date: asDate(addDays(iso(d.date), delta)) },
      });
    }
  });
}

export async function shift(actor: Actor, id: string, deltaDays: number) {
  if (!(await isAllocator(actor))) {
    await deny(actor, 'schedule.shift', id, 'Moving a whole series needs the allocate permission.');
  }
  await shiftSeriesBy(id, deltaDays);
  await audit.record({
    actorId: actor.id,
    action: 'task.shifted',
    subjectType: 'task',
    subjectId: id,
    meta: { deltaDays },
  });
  return { id };
}

/* --------------------------------------------------------------- remove */

export async function remove(actor: Actor, id: string, scope: string, date?: string) {
  const row = await loadTask(id);
  const people = await peopleFor(row.assigneeIds, row.groupIds);
  if (!(await canEdit(actor, row, people))) {
    await deny(actor, 'schedule.delete', id, 'That task is not yours to remove.');
  }

  if (scope === 'occurrence' && date) {
    await prisma.taskException.upsert({
      where: { taskId_date: { taskId: id, date: asDate(date) } },
      create: { taskId: id, date: asDate(date), cancelled: true },
      update: { cancelled: true },
    });
  } else {
    await prisma.task.delete({ where: { id } });
  }

  await audit.record({
    actorId: actor.id,
    action: 'task.deleted',
    subjectType: 'task',
    subjectId: id,
    meta: { scope, date: date ?? null },
  });
  return { ok: true };
}

/* ----------------------------------------------------------------- done */

export async function setDone(actor: Actor, id: string, date: string, done: boolean) {
  const row = await loadTask(id);
  const people = await peopleFor(row.assigneeIds, row.groupIds);
  if (!(await isAllocator(actor)) && !people.includes(actor.id)) {
    await deny(actor, 'schedule.done', id, 'Only somebody on the task can tick it off.');
  }

  if (done) {
    await prisma.taskDone.upsert({
      where: { taskId_date: { taskId: id, date: asDate(date) } },
      create: { taskId: id, date: asDate(date), byId: actor.id },
      update: { byId: actor.id, at: new Date() },
    });
  } else {
    await prisma.taskDone
      .delete({ where: { taskId_date: { taskId: id, date: asDate(date) } } })
      .catch(() => undefined);
  }
  return { id, date, done };
}

/* ------------------------------------------------------------- responses */

/**
 * RULE 4. Anyone BOUND to a group task can accept, hold, decline or ask for a new
 * time. Somebody who is not on it has nothing to answer, and a task with one pair
 * of hands has nobody to agree with.
 */
export async function respond(actor: Actor, id: string, state: string) {
  const row = await loadTask(id);
  const people = await peopleFor(row.assigneeIds, row.groupIds);

  if (!isGroupTask({ groupIds: row.groupIds }, people)) {
    throw ApiError.conflict('A task with one person on it needs nobody’s agreement.');
  }
  if (!people.includes(actor.id)) {
    throw ApiError.conflict('You are not on that task.');
  }

  await prisma.taskResponse.upsert({
    where: { taskId_userId: { taskId: id, userId: actor.id } },
    create: { taskId: id, userId: actor.id, state: state.toUpperCase() as never },
    update: { state: state.toUpperCase() as never, at: new Date() },
  });

  const responses = await prisma.taskResponse.findMany({ where: { taskId: id } });
  const map = Object.fromEntries(
    responses.map((r) => [r.userId, r.state.toLowerCase() as RespState]),
  );
  return { id, resp: respSummary(people, map) };
}

/* ------------------------------------------------------------- proposals */

export async function propose(
  actor: Actor,
  id: string,
  input: { date: string; startMin: number; durMin: number; note?: string },
) {
  const row = await loadTask(id);
  const people = await peopleFor(row.assigneeIds, row.groupIds);
  if (!people.includes(actor.id)) {
    throw ApiError.conflict('You are not on that task.');
  }

  const p = await prisma.taskProposal.create({
    data: {
      taskId: id,
      byId: actor.id,
      date: asDate(input.date),
      startMin: input.startMin,
      durMin: input.durMin,
      note: input.note ?? null,
    },
  });

  /* asking for a new time IS a response — the tile should stop reading as though
     this person had simply not looked yet */
  await prisma.taskResponse.upsert({
    where: { taskId_userId: { taskId: id, userId: actor.id } },
    create: { taskId: id, userId: actor.id, state: 'RESCHED' },
    update: { state: 'RESCHED', at: new Date() },
  });

  /* who holds the Apply button: the creator when there is one and it is not the
     proposer, otherwise every allocator */
  let recipients: string[];
  if (row.createdById && row.createdById !== actor.id) {
    recipients = [row.createdById];
  } else {
    const staff = await prisma.user.findMany({
      where: { status: 'active', role: { not: 'client' } },
      select: { id: true, role: true },
    });
    const allowed = await Promise.all(staff.map((u) => can(u.role as string, 'allocate')));
    recipients = staff.filter((_u, i) => allowed[i]).map((u) => u.id).filter((x) => x !== actor.id);
  }

  return { id: p.id, recipients };
}

export async function applyProposal(actor: Actor, proposalId: string) {
  const p = await prisma.taskProposal.findUnique({
    where: { id: proposalId },
    include: { task: true },
  });
  if (!p) throw ApiError.notFound('No such proposal.');
  if (p.appliedAt) throw ApiError.conflict('That proposal has already been applied.');

  const allocator = await isAllocator(actor);
  if (!allocator && p.task.createdById !== actor.id) {
    await deny(
      actor,
      'schedule.applyProposal',
      p.taskId,
      'Only an allocator or the person who made the task can apply a new time.',
    );
  }

  /* through the SAME move path a drag takes, so a proposal cannot land somewhere
     a drag would have been refused */
  if (p.task.date === null) {
    throw ApiError.badRequest('That task is not on the calendar, so there is no time to move.');
  }
  await move(actor, p.taskId, {
    fromDate: iso(p.task.date),
    toDate: iso(p.date),
    startMin: p.startMin,
    durMin: p.durMin,
    scope: 'series',
  });

  await prisma.$transaction([
    prisma.taskProposal.update({
      where: { id: proposalId },
      data: { appliedAt: new Date(), appliedById: actor.id },
    }),
    ...(p.byId
      ? [
          /* the person who asked for this time has, by definition, accepted it */
          prisma.taskResponse.upsert({
            where: { taskId_userId: { taskId: p.taskId, userId: p.byId } },
            create: { taskId: p.taskId, userId: p.byId, state: 'ACCEPTED' },
            update: { state: 'ACCEPTED', at: new Date() },
          }),
        ]
      : []),
  ]);

  return { taskId: p.taskId, proposerId: p.byId };
}

/*
 * WHERE THE REMINDER SWEEP WILL READ.
 *
 * The demo's `flowSweep` walks the day's occurrences and sends what is due. Its
 * port belongs here rather than in the job, so that the reminder and the grid
 * agree about what "today at 10:00" means — including a per-occurrence coach
 * swap, which is exactly the case a second expansion would get wrong. It will
 * call `expandRange` over today and read `peopleOfTask` for the recipients.
 */
