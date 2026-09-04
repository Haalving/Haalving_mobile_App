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
  seriesSkipsOffDaysFor,
  weekdayOf,
  whoIndex,
  worksOnDate,
  type Conflict,
  type RecurFreq,
  type SchedTask,
  type SchedUser,
  type ScheduleOccurrence,
  type ScheduleTask,
  type RespState,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { calendarDay } from '../utils/dates.js';
import { podSeatScope, clientScopeWhere } from './scope.service.js';
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
 * The nine rules and where each lives:
 *   1 overlap opt-in, both sides   -> `checkConflicts`, via conflicts.ts
 *   2 hours bind assignees only    -> `hoursFor` in `dayWorld`
 *   3 rhythm holds no capacity     -> `rhythm: true` on DUTY in `dayWorld`
 *   4 group tasks need acceptance  -> `respond`, and `respSummary` on read
 *   5 the lens                     -> `lensFor`
 *   6 editing                      -> `canEdit`
 *   7 recurrence expands on read   -> `expandRange`, `TaskException`
 *   8 sessions carry the pillar    -> `pillarForRole` at create
 *   9 "every day" = every WORKING  -> `occursOnDate`'s roster, handed to it by
 *     day                             `schedUsers()` from every read and walk
 *
 * RULE 9 IS NOT ENFORCED HERE, and that is the point of it: it is a fact about
 * when a series HAPPENS, not a refusal, so it lives in the shared oracle and this
 * module's job is only to hand over the declared weeks. A day nobody on the task
 * works never reaches `checkConflicts` at all.
 */

export interface Actor {
  id: string;
  role: string;
}

const isAllocator = (a: Actor) => can(a.role, 'allocate');

/**
 * WHOSE CALENDAR MAY YOU WRITE ON.
 *
 * Yourself, and anyone who allocates — the Super Admin, the Haalving Coach, the
 * Operations Head, a Head of Department. Never a coach's calendar: a coach's hours
 * are booked by the person who runs their pod, and a peer dropping a meeting on
 * them is the thing this rule exists to stop.
 *
 * Derived from `allocate` rather than a list of role keys, so it stays true when a
 * seat is renamed in People & Access — which is how the rest of this console
 * treats authority. `bookAnyone` is the Super Admin's exemption.
 */
export async function bookableStaffIds(actor: Actor): Promise<Set<string>> {
  const staff = await prisma.user.findMany({
    where: { role: { not: 'client' }, status: 'active' },
    select: { id: true, role: true },
  });
  if (await can(actor.role, 'bookAnyone')) return new Set(staff.map((u) => u.id));

  const allowed = await Promise.all(staff.map((u) => can(u.role as string, 'allocate')));
  const ids = staff.filter((_u, i) => allowed[i]).map((u) => u.id);
  /* always yourself, even if you allocate nothing — you may book your own hours */
  return new Set([actor.id, ...ids]);
}

/**
 * Which clients you may put on a task — the ones whose pod you sit on.
 *
 * The same question the Deviations board asks, and the same answer, because
 * "yours" means one thing in this product. `clientScopeWhere` is the wrong helper
 * here for the reason it is wrong there: it answers "whose record may you READ",
 * and a `seeAllClients` seat reads everybody. Booking is not reading.
 */
async function bookableClientWhere(actor: Actor): Promise<Prisma.ClientWhereInput> {
  if (await can(actor.role, 'bookAnyone')) return {};
  return podSeatScope({ id: actor.id, role: actor.role });
}

/** Refuse a task whose people or client are not this caller's to book. */
async function requireBookable(
  actor: Actor,
  what: string,
  subjectId: string | null,
  people: string[],
  clientId: string | null | undefined,
): Promise<void> {
  const bookable = await bookableStaffIds(actor);

  const strangers = people.filter((id) => !bookable.has(id));
  if (strangers.length) {
    await deny(
      actor,
      what,
      subjectId,
      'You can put this on your own calendar and on an allocator’s — not on a coach’s.',
    );
  }

  if (clientId) {
    const ok = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, await bookableClientWhere(actor)] },
      select: { id: true },
    });
    if (!ok) {
      await deny(actor, what, subjectId, 'That client is not on your pod.');
    }
  }
}

/**
 * Every date this module touches — `Task.date`, `Task.recurUntil`,
 * `TaskException.date`, `TaskDone.date`, `TaskProposal.date` — is a `@db.Date`,
 * so it is read and written as a CALENDAR DAY in UTC.
 *
 * `calendarDay` used to be a private `asDate` here. It moved to `utils/dates.ts`
 * because the work list needed the same rule and got it wrong: one implementation
 * beside the local-midnight helper it is so easily mistaken for.
 */
const iso = (d: Date): string => d.toISOString().slice(0, 10);

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

/**
 * Everybody's declared week, as the engine reads it.
 *
 * EXPORTED because the work list needs the same answer. "Every day" now means
 * every day the person works, and a board that resolved the declared weeks its
 * own way would be the calendar and the queue disagreeing about whether today's
 * duty exists — the exact drift `occursOnDate` was made single for.
 */
export async function schedUsers(): Promise<SchedUser[]> {
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
 *
 * `skipsOffDays` says these dates are the occurrences of a series that skips the
 * days its people do not work — `seriesSkipsOffDays` is the one predicate that
 * decides it, so this flag cannot drift from the oracle that built `dates`. It
 * matters here for the one case the skip alone cannot answer: a task naming TWO
 * people occurs on a day only one of them works (a meeting does not vanish
 * because one attendee is off), and the other must not then be refused for
 * keeping no hours on a day that was never theirs.
 */
export async function checkConflicts(input: {
  people: string[];
  assigneeIds: string[];
  dates: string[];
  startMin: number;
  durMin: number;
  allowOverlap: boolean;
  exceptTaskId?: string;
  skipsOffDays?: boolean;
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

  const byId = new Map(users.map((u) => [u.id, u]));

  for (const date of input.dates) {
    /* the roster travels with the expansion: a series whose people are all off
       that day holds no time, so it must not be found busy either */
    const occs = expandRange(tasks, date, date, users);

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
      /*
       * A DAY THAT IS NOT THEIR DAY IS NOT A REFUSAL.
       *
       * Only reachable when a task names more than one person: the day is here
       * because somebody else on it works, and this one keeps no hours at all.
       * Under the working-week rule they are simply not part of that occurrence,
       * so raising "Anita R. is off on Sun 6 Sep" would refuse a Sunday meeting
       * that was never hers to attend. The SAME `worksOnDate` the oracle skips
       * with, asked of the same declared week, so the two cannot drift.
       *
       * Only `hours` is dropped. Being booked and being on approved leave are
       * facts about the person on a day that IS happening, and they still bind.
       */
      if (input.skipsOffDays && c.type === 'hours' && !worksOnDate(byId.get(c.whoId), date)) {
        continue;
      }
      /*
       * WHICH DAY FAILED — stamped here, because only here knows.
       *
       * `input.dates[0]` is the day on the form: the one the booker chose and is
       * looking at while they read the refusal. Everything after it is an
       * occurrence they have not seen, and "Anita R. is off that day" about one
       * of those is a true sentence nobody can act on — the form says Friday and
       * she works Fridays. So a refusal from a later occurrence carries its own
       * date and `blockWords` names it; a refusal from the first carries none and
       * reads exactly as it always did.
       *
       * The engine cannot do this. It counts in `rd` offsets from the `now` it is
       * handed, and `dayWorld` hands it the target date as rd 0 — so every day
       * looks like "the day being asked about" from in there.
       */
      const named = date === input.dates[0] ? c : { ...c, on: date };
      /* deduped WITHOUT the date, so the FIRST day a person fails on is the one
         named — a coach off every Sunday should produce one sentence, not two */
      if (!out.some((x) => x.type === c.type && x.whoId === c.whoId && x.detail === c.detail)) {
        out.push(named);
      }
    }
  }

  return out;
}

/**
 * The first 14 dates a task runs on, which is what a create/edit is checked
 * against.
 *
 * THE ROSTER IS WHY THIS IS ASYNC. Under the working-week rule a day its people
 * do not work is not an occurrence at all, so it never enters this list and
 * therefore contributes no conflict — which is how "book Anita every day from
 * Friday" is accepted rather than refused for her Sunday. The skip is not applied
 * here; it is applied by `occursOnDate`, and this walk simply asks it.
 *
 * `limit` still counts REAL occurrences, so a series thinned by somebody's days
 * off is still checked a fortnight deep rather than a fortnight of calendar.
 */
async function occurrenceDates(t: ScheduleTask, limit = 14): Promise<string[]> {
  /* a single booking has one date and no series to thin — no roster needed, and
     no skip either: placing one on somebody's day off is still refused */
  if (t.recurFreq === 'none') return [t.date];
  const roster = await schedUsers();
  const out: string[] = [];
  let n = dayNumber(t.date);
  const end = t.recurUntil ? dayNumber(t.recurUntil) : n + 365;
  while (out.length < limit && n <= end) {
    const date = isoOfDayNumber(n);
    if (occursOnDate(t, date, roster)) out.push(date);
    n += 1;
  }
  return out;
}

function refuse(found: Conflict[]): never {
  const first = found[0] as Conflict;
  throw new ApiError(409, 'SCHEDULE_CONFLICT', blockWords(first), {
    /* `on` travels with each one: the sheet re-phrases the list through the same
       `clashWords` the live hint uses, and without the day it would draw the
       vague sentence next to the specific one the 409 already gave */
    conflicts: found.map((c) => ({
      type: c.type,
      who: c.who,
      whoId: c.whoId,
      detail: c.detail,
      ...(c.on ? { on: c.on } : {}),
    })),
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

  /*
   * THE CLIENT FILTER IS SCOPED, which it was not.
   *
   * `?client=<id>` went straight into the WHERE, so any seat holding the schedule
   * rail could read any client's whole calendar by guessing an id — a coach could
   * read the Super Admin's clients, and the lens above never saw it because the
   * lens filters PEOPLE, not clients.
   *
   * Asked of `clientScopeWhere` rather than the booking scope on purpose: reading
   * a calendar is reading, and a seat that may open a client's record may see
   * their sessions. Booking is the narrower act and is gated separately.
   */
  let clientWhere: Prisma.TaskWhereInput = {};
  if (q.client) {
    const visible = await prisma.client.findFirst({
      where: { AND: [{ id: q.client }, await clientScopeWhere({ id: actor.id, role: actor.role })] },
      select: { id: true },
    });
    /* an id you may not see returns an EMPTY calendar rather than a refusal: a 403
       here would confirm the client exists, which is the fact being protected */
    clientWhere = visible ? { clientId: q.client } : { id: { in: [] } };
  }
  const rows = await loadTasks(clientWhere);
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

  /*
   * THE GRID DRAWS WHAT ACTUALLY HAPPENS, so the declared weeks come with the
   * expansion: a daily duty paints no tile and no rhythm dot on a day its person
   * is off. Both bands below are slices of this one list, which is why neither
   * needs to know the rule.
   */
  const all = expandRange(tasks, q.from, q.to, await schedUsers()).filter((o) =>
    inLens(o.task.id),
  );

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
  /*
   * FLAGGED, NOT FILTERED.
   *
   * `who` is a POSITIONAL colour slot, so dropping people here would renumber
   * everybody and silently recolour the whole grid. The list also names the
   * people on tiles you did not book — narrowing it would blank those names.
   * The sheet's picker reads the flag; everything else reads the list.
   */
  const bookable = await bookableStaffIds(actor);
  const staff = staffRows.map((u, i) => ({
    id: u.id,
    name: u.name,
    role: u.role as string,
    who: whoIndex(i),
    bookable: bookable.has(u.id),
  }));

  /* the client half of the same answer, so the sheet's picker offers only what
     `create` will accept. Ids rather than records — the sheet already has the
     names from the Clients read, and sending them twice invites them to differ. */
  const bookableClientIds = (
    await prisma.client.findMany({
      where: await bookableClientWhere(actor),
      select: { id: true },
    })
  ).map((c) => c.id);

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
      /*
       * EVERY PARTICIPANT'S ANSWER, not just the reader's.
       *
       * This used to send only `mine`, and the sheet said so out loud — "the
       * count is everybody's answer; the pill is your own". A bare 3/5 tells you
       * two people have not answered but not WHICH, so the one chase a meeting
       * organiser actually needs to make was the one thing the screen withheld.
       * Only the people already named on the tile appear here, so this discloses
       * nothing about anybody the reader cannot already see.
       */
      states: Object.fromEntries(people.map((id) => [id, responses[id] ?? null])),
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
    bookableClientIds,
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

  /* and even an allocator books UPWARD, on their own clients — the sheet's pickers
     show the same answer, but a picker is a courtesy and this is the rule */
  await requireBookable(actor, 'schedule.create', null, people, input.clientId);

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
    dates: await occurrenceDates(draft),
    startMin: input.startMin,
    durMin: input.durMin,
    allowOverlap: input.allowOverlap,
    skipsOffDays: seriesSkipsOffDaysFor(draft.recurFreq, draft.groupIds),
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
      date: calendarDay(input.date),
      startMin: input.startMin,
      durMin: input.durMin,
      recurFreq: input.recurFreq.toUpperCase() as never,
      recurUntil: input.recurUntil ? calendarDay(input.recurUntil) : null,
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

  /* Changing who is on a task is booking them, so it answers to the same rule as
     creating one — otherwise the gate is a door with a window beside it. Only the
     people being ADDED are tested: somebody already on the task got there under
     whatever rule applied then, and refusing to let you edit a title because a
     coach is booked would make the task uneditable rather than safe. */
  const added = nextPeople.filter((x) => !people.includes(x));
  await requireBookable(
    actor,
    'schedule.edit',
    id,
    added,
    input.clientId === undefined ? null : input.clientId,
  );

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
      /* AN OCCURRENCE EDIT STAYS INSIDE THE SERIES, so it keeps the series'
         exemption. An exception row does not detach anything — the task remains
         one recurring row — so without this the oracle would draw an occurrence
         on the grid that this path then refused to let anybody edit, naming a
         person the same oracle had already decided was not part of it. */
      skipsOffDays: seriesSkipsOffDaysFor(
        (input.recurFreq ?? row.recurFreq.toLowerCase()) as RecurFreq,
        nextGroups,
      ),
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
      where: { taskId_date: { taskId: id, date: calendarDay(date) } },
      create: { taskId: id, date: calendarDay(date), ...data },
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
      dates: await occurrenceDates(next),
      startMin,
      durMin,
      allowOverlap: input.allowOverlap ?? row.allowOverlap,
      exceptTaskId: id,
      skipsOffDays: seriesSkipsOffDaysFor(next.recurFreq, nextGroups),
    });
    if (found.length) refuse(found);

    await prisma.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.kind !== undefined ? { kind: input.kind.toUpperCase() as never } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        ...(input.date !== undefined ? { date: calendarDay(input.date) } : {}),
        startMin,
        durMin,
        ...(input.recurFreq !== undefined
          ? { recurFreq: input.recurFreq.toUpperCase() as never }
          : {}),
        ...(input.recurUntil !== undefined
          ? { recurUntil: input.recurUntil ? calendarDay(input.recurUntil) : null }
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

  const recurring = row.recurFreq !== 'NONE';
  const sameDay = input.fromDate === input.toDate;

  /*
   * THE EXEMPTION FOLLOWS WHAT THIS DRAG WILL WRITE, not what the row is now.
   *
   * A series may land on a day one of its people does not work, because the
   * occurrence there simply does not exist. A SINGLE booking may not — and
   * dragging one occurrence of a series across days DETACHES it: the branch
   * below cancels it here and writes a standalone `recurFreq: 'NONE'` task
   * there. Reading the flag off the parent's frequency handed that one-off the
   * series' exemption, so a drag could put a lone booking on a coach's day off
   * that the create sheet refuses outright.
   */
  const detaching = recurring && !sameDay && input.scope !== 'series';

  const found = await checkConflicts({
    people,
    assigneeIds: row.assigneeIds,
    dates: [input.toDate],
    startMin: input.startMin,
    durMin: input.durMin,
    allowOverlap: row.allowOverlap,
    exceptTaskId: id,
    /* THE SAME SERIES, THE SAME RULE. A drag is the create sheet's refusal
       arriving through a different gesture: without this flag a series that
       skips its people's off days is accepted by the sheet and then refused
       the moment somebody drags it, with the sentence this rule exists to
       stop ever being printed. */
    skipsOffDays: detaching
      ? false
      : seriesSkipsOffDaysFor(row.recurFreq.toLowerCase() as RecurFreq, row.groupIds),
  });
  if (found.length) refuse(found);

  if (!recurring) {
    await prisma.task.update({
      where: { id },
      data: { date: calendarDay(input.toDate), startMin: input.startMin, durMin: input.durMin },
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
      where: { taskId_date: { taskId: id, date: calendarDay(input.toDate) } },
      create: {
        taskId: id,
        date: calendarDay(input.toDate),
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
      where: { taskId_date: { taskId: id, date: calendarDay(input.fromDate) } },
      create: { taskId: id, date: calendarDay(input.fromDate), cancelled: true },
      update: { cancelled: true },
    });
    return tx.task.create({
      data: {
        title: row.title,
        kind: row.kind,
        clientId: row.clientId,
        pillar: row.pillar,
        date: calendarDay(input.toDate),
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
        date: calendarDay(addDays(iso(row.date), delta)),
        ...(row.recurUntil ? { recurUntil: calendarDay(addDays(iso(row.recurUntil), delta)) } : {}),
        ...(startMin !== undefined ? { startMin } : {}),
        ...(durMin !== undefined ? { durMin } : {}),
      },
    });
    /* exceptions and done marks travel with the series, or they would point at
       dates the series no longer runs on */
    for (const e of row.exceptions) {
      await tx.taskException.update({
        where: { id: e.id },
        data: { date: calendarDay(addDays(iso(e.date), delta)) },
      });
    }
    for (const d of row.dones) {
      await tx.taskDone.update({
        where: { id: d.id },
        data: { date: calendarDay(addDays(iso(d.date), delta)) },
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
      where: { taskId_date: { taskId: id, date: calendarDay(date) } },
      create: { taskId: id, date: calendarDay(date), cancelled: true },
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
      where: { taskId_date: { taskId: id, date: calendarDay(date) } },
      create: { taskId: id, date: calendarDay(date), byId: actor.id },
      update: { byId: actor.id, at: new Date() },
    });
  } else {
    await prisma.taskDone
      .delete({ where: { taskId_date: { taskId: id, date: calendarDay(date) } } })
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
      date: calendarDay(input.date),
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
