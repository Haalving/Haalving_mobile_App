/**
 * The team's working calendar — the shape of a task, and when it happens.
 *
 * Ported from `demo/app/js/views/console-schedule.js` (KINDS, ROLE_PILLAR,
 * groupsAll, layout, RESP, respState, isGroupTask) and `HV.occursOn`
 * (core.js:499-530).
 *
 * ONE DEPARTURE FROM THE DEMO, and it runs through everything here: the demo
 * counts days as `rd`, an integer offset from "now", because a browser store that
 * is reseeded on load can afford to. A database cannot — a task written on Monday
 * would slide by one every midnight. So this module works in REAL ISO DATES and
 * `until` is a date.
 *
 * `conflicts.ts` still speaks `rd`, deliberately: it is already ported, tested and
 * correct, and its questions ("is this person busy at 10:00 on THIS day") are all
 * within one day. The service bridges by treating the target date as rd 0 — see
 * `dayWorld` there. Nothing in conflicts.ts changed.
 */

import {
  OFF_ALL_DAY,
  WD,
  availWindows,
  declaresAWeek,
  type SchedUser,
  type Weekday,
} from './conflicts.js';

/* ------------------------------------------------------------------ kinds */

export const KINDS = {
  session: { name: 'Client session', cls: 'k-session' },
  meeting: { name: 'Client meeting', cls: 'k-meeting' },
  internal: { name: 'Team internal', cls: 'k-internal' },
  duty: { name: 'Daily duty', cls: 'k-duty' },
} as const;

export type TaskKind = keyof typeof KINDS;
export const KIND_KEYS = Object.keys(KINDS) as TaskKind[];

/*
 * A session carries the PILLAR of the coach's role, and that is the only place a
 * pillar colour appears on this grid.
 *
 * The demo declares its own ROLE_PILLAR here; the port already has the identical
 * map in `pillars.ts` (with `pillarOfRole` beside it), so this module re-exports
 * rather than declaring a second one that could drift.
 */
export { ROLE_PILLAR, pillarForRole } from './pillars.js';

/* ------------------------------------------------------------------ hours */

/** The visible window, and the grid's units. */
export const H0 = 7;
export const H1 = 21;
export const PX_PER_HOUR = 48;
export const SNAP_MIN = 15;

export const DAY_START_MIN = H0 * 60;
export const DAY_END_MIN = H1 * 60;

const pad2 = (n: number) => String(n).padStart(2, '0');

/* `'HH:MM'` to minutes-of-day already exists in conflicts.ts, which validates the
   range as well; the two vocabularies are the same one. */
export { hmToMin } from './conflicts.js';

export function minToHm(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

/**
 * `7 am`, `3:30 pm` — the demo's `fmtT`, which DROPS a zero minute.
 *
 * Deliberately not `fmtTime` from conflicts.ts, which always prints `7:00 am`.
 * The two are different registers and both are right: a refusal sentence names an
 * exact boundary ("outside 09:00-17:00") and wants the zeroes, while an hour rail
 * and a tile label are read at a glance and the zeroes are noise. Naming them
 * apart keeps either from being "tidied" into the other.
 */
export function fmtShortTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${pad2(m)}` : ''}${h < 12 ? ' am' : ' pm'}`;
}

export function snapMin(v: number): number {
  return Math.round(v / SNAP_MIN) * SNAP_MIN;
}

/** Into the visible day, leaving room for the shortest tile. */
export function clampMin(v: number): number {
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SNAP_MIN, v));
}

/* ------------------------------------------------------------------ dates */

/**
 * Days since the epoch, counted in UTC from a `YYYY-MM-DD`.
 *
 * UTC on purpose. Counting with local `Date` arithmetic makes the gap between two
 * dates 23 or 25 hours across a DST boundary, and `gap % 2` for an alternate-day
 * series then skips or repeats a day — once a year, in one hemisphere, which is
 * the least findable bug this file could carry.
 */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

export function isoOfDayNumber(n: number): string {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(iso: string, delta: number): string {
  return isoOfDayNumber(dayNumber(iso) + delta);
}

/** `0` Sunday … `6` Saturday, read in UTC so it matches `dayNumber`. */
export function weekdayOf(iso: string): number {
  return new Date(dayNumber(iso) * 86_400_000).getUTCDay();
}

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export function dayName(iso: string): string {
  return WD_SHORT[weekdayOf(iso)] as string;
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * `Sun 6 Sep` — a date said the way a refusal has to say it.
 *
 * The WEEKDAY leads because that is what an hours refusal is actually about: the
 * useful half of "Anita is off on Sun 6 Sep" is *Sunday*. Read in UTC, like every
 * other reader in this section, so it names the same day `dayNumber` counted.
 * No year: a refusal is always about the next fortnight.
 */
export function dayLabel(iso: string): string {
  const d = new Date(dayNumber(iso) * 86_400_000);
  return `${dayName(iso)} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/* ------------------------------------------------------------- recurrence */

export const RECUR = ['none', 'daily', 'alt', 'weekly'] as const;
export type RecurFreq = (typeof RECUR)[number];

export const RECUR_LABEL: Record<RecurFreq, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  alt: 'Alternate days',
  weekly: 'Every week',
};

export interface TaskExceptionRec {
  /** The date this exception speaks for. */
  date: string;
  cancelled?: boolean;
  startMin?: number | null;
  durMin?: number | null;
  title?: string | null;
  link?: string | null;
  notes?: string | null;
  /** `{ fromId, toId }` — how an approved leave cover reaches one occurrence. */
  coachSwap?: { fromId: string; toId: string } | null;
}

export interface ScheduleTask {
  id: string;
  title: string;
  kind: TaskKind;
  clientId?: string | null;
  pillar?: string | null;
  /** The FIRST occurrence. A series is anchored here and counted from it. */
  date: string;
  startMin: number;
  durMin: number;
  recurFreq: RecurFreq;
  recurUntil?: string | null;
  assigneeIds: string[];
  groupIds: string[];
  link?: string | null;
  notes?: string | null;
  allowOverlap?: boolean;
  exceptions?: TaskExceptionRec[];
  /** ISO dates this task has been marked done on. */
  doneDates?: string[];
}

export interface ScheduleOccurrence {
  task: ScheduleTask;
  date: string;
  startMin: number;
  durMin: number;
  title: string;
  link: string | null;
  notes: string | null;
  /** After any per-occurrence coach swap. */
  assigneeIds: string[];
  edited: boolean;
  done: boolean;
  cancelled: false;
  /** Filled by `layoutLanes`. */
  lane?: number;
  lanes?: number;
}

function exceptionOn(t: ScheduleTask, date: string): TaskExceptionRec | undefined {
  return t.exceptions?.find((e) => e.date === date);
}

/* -------------------------------------------------------- the working week */

/**
 * "EVERY DAY" MEANS EVERY DAY THEY WORK — the owner's rule, 4 September 2026.
 *
 * A recurring task simply HAS NO OCCURRENCE on a day its person does not work.
 * Anita works Mon-Sat and is off Sunday, so a daily task on Anita runs Mon-Sat,
 * and Sunday was never one of its days.
 *
 * This is a change of MEANING, not a new warning, and the three things it is NOT
 * are the whole of it:
 *
 *  - NOT A CONFLICT. Booking her "every day" from a Friday is accepted. There is
 *    nothing to refuse, because Sunday was never one of the series' days.
 *  - NOT AN EXCEPTION ROW. Nothing is written per skipped day. The skip is
 *    derived from the declared week every time an occurrence is asked for,
 *    exactly as the grid's off-hours hatching is.
 *  - NOT A SECOND RULE. It lives inside `occursOnDate` — the one oracle the
 *    grid, the rhythm bar, the work list, the cover board and the conflict walk
 *    all read — so no surface can be told a different answer.
 */

/**
 * `declaresAWeek` — "has anybody declared this person's week at all" — LIVES IN
 * conflicts.ts, beside the `availWindows`/`availFits` pair that reads the same
 * column, and is re-exported here so the rule reads in one place.
 *
 * It is there rather than here because BOTH SIDES of the rule need it. This
 * module answers "is it their day"; conflicts.ts answers "may they be booked
 * then". While the two disagreed about what an EMPTY week (`{}`, what a staff row
 * is created with) means, the guard that drops an off-day refusal could never
 * fire for the one staff state the rule singles out as must-not-regress.
 */
export { declaresAWeek } from './conflicts.js';

/**
 * Is this person at work on that date, by their own declared week?
 *
 * `availWindows` is the ONLY safe reader of `avail` — it is what handles a split
 * shift, where indexing `[0]`/`[1]` returns nothing and does it silently — so the
 * question is asked as "does that weekday hold any window at all", never as "is
 * `avail[wd]` truthy".
 *
 * Exported because the conflict walk asks it too: a day that is not this
 * person's day must not raise an hours refusal against them either.
 */
export function worksOnDate(u: SchedUser | null | undefined, date: string): boolean {
  if (!u) return true; /* not on the roster — nothing here declares them off */
  if (u.ai) return true; /* the AI keeps no hours, so it is never off */
  if (!declaresAWeek(u)) return true; /* no week declared — see the note above */
  return availWindows(u, WD[weekdayOf(date)] as Weekday).length > 0;
}

/**
 * Which frequencies the skip applies to.
 *
 * `daily` and `alt` VISIT EVERY WEEKDAY over a fortnight, so dropping the days
 * that were never theirs thins the series and leaves it a series.
 *
 * `weekly` is ONE WEEKDAY by definition. Skipping that weekday would not thin the
 * series, it would erase it — the booking would be accepted and then never
 * happen — so a weekly task pinned to somebody's day off is still refused, and
 * the refusal names the day. `none` is a single booking and is refused for the
 * same reason: ONLY SERIES SKIP.
 */
export function seriesSkipsOffDays(freq: RecurFreq): boolean {
  return freq === 'daily' || freq === 'alt';
}

/**
 * The same question, asked the way the CONFLICT side has to ask it.
 *
 * `seriesRunsOn` keeps every day of a task that carries a GROUP, because a pure
 * module cannot resolve who is in one and dropping a day on a guess would delete
 * work. The conflict door has to agree with that: if the occurrence is going to
 * exist, its off-hours refusal must still be heard. Exempting it on frequency
 * alone silenced the refusal for a day the oracle had already decided happens —
 * so a group meeting landed on somebody's day off with nothing said.
 *
 * The two are one decision and belong in one place; call this one wherever a
 * task's groups are known, and `seriesSkipsOffDays` only where they cannot be.
 */
export function seriesSkipsOffDaysFor(freq: RecurFreq, groupIds: readonly string[] = []): boolean {
  return groupIds.length === 0 && seriesSkipsOffDays(freq);
}

/**
 * Does this task's series run on this date, given whose it is?
 *
 * ANYBODY WORKING IS ENOUGH. A task can name several people, and a team meeting
 * should not vanish because one attendee is off. That individual is still spoken
 * for, elsewhere: `worksOnDate` is what stops the conflict walk raising an hours
 * refusal against the person whose day it is not.
 *
 * A task naming NOBODY — an unassigned row — keeps every day. There is no week to
 * consult, and inventing one would silently drop work.
 *
 * A TASK CARRYING A GROUP KEEPS THE DAY, WHOEVER ELSE IT NAMES. This module is
 * pure: it holds no store and cannot resolve `g-diet` into people, so it cannot
 * ask whether the bench works. The conservative branch is the only honest one —
 * and it is also the only MONOTONIC one. Without it, a group-only row kept every
 * day while adding one named person to that same row deleted that person's days
 * off from every surface: inviting somebody would delete the meeting the rest of
 * the team still has. Skipping a day is a claim that NOBODY on the task is
 * working, and a row with an unresolved bench on it cannot make that claim.
 *
 * DUTIES ARE NOT SPECIAL, and that is deliberate: a standing duty is not owed on
 * somebody's day off, and it reaches this rule by being a daily task like any
 * other rather than by being named here.
 */
function seriesRunsOn(
  freq: RecurFreq,
  assigneeIds: string[],
  groupIds: string[],
  date: string,
  roster: SchedUser[],
): boolean {
  if (!seriesSkipsOffDays(freq)) return true;
  if (groupIds.length > 0) return true;
  if (assigneeIds.length === 0) return true;
  return assigneeIds.some((id) => worksOnDate(roster.find((u) => u.id === id) ?? null, date));
}

/**
 * Does this task happen on this date, and in what shape?
 *
 * `null` means it does not — either the pattern misses the day, or an exception
 * cancelled it. A caller that wants "cancelled" told apart from "never scheduled"
 * should ask `exceptionOn` as well; the grid does not care, because both mean
 * nothing is drawn.
 *
 * Named `occursOnDate`, not `occursOn`, because conflicts.ts already exports the
 * rd-based sibling this was ported alongside. The suffix is the whole difference:
 * this one takes a real date.
 *
 * `roster` is the declared weeks, and WITHOUT IT THE WORKING-WEEK SKIP CANNOT BE
 * ASKED. This module is pure and holds no store, so the weeks have to arrive with
 * the question. A caller that passes none is answered the way a person with no
 * declared week is answered — every day — which is exactly what every caller got
 * before the rule existed, so an un-plumbed surface is stale rather than wrong.
 * Every surface that knows the roster hands it over.
 */
export function occursOnDate(
  t: ScheduleTask,
  date: string,
  roster?: SchedUser[] | null,
): ScheduleOccurrence | null {
  const anchor = dayNumber(t.date);
  const target = dayNumber(date);

  let hit: boolean;
  if (t.recurFreq === 'none') {
    hit = target === anchor;
  } else if (target >= anchor && (!t.recurUntil || target <= dayNumber(t.recurUntil))) {
    const gap = target - anchor;
    hit = t.recurFreq === 'daily' ? true : t.recurFreq === 'alt' ? gap % 2 === 0 : gap % 7 === 0;
  } else {
    hit = false;
  }
  if (!hit) return null;

  const ex = exceptionOn(t, date);
  if (ex?.cancelled) return null;

  const assignees = [...(t.assigneeIds ?? [])];
  if (ex?.coachSwap) {
    const at = assignees.indexOf(ex.coachSwap.fromId);
    if (at >= 0) assignees[at] = ex.coachSwap.toId;
  }

  /*
   * THE WORKING-WEEK SKIP, asked once, here — the rule is written out above.
   *
   * Asked AFTER the coach swap because a leave cover hands one occurrence to
   * somebody else, and the day belongs to whoever is actually taking it: a
   * session covered by a coach who works Sundays happens on Sunday.
   */
  if (roster && !seriesRunsOn(t.recurFreq, assignees, t.groupIds ?? [], date, roster)) return null;

  return {
    task: t,
    date,
    startMin: ex?.startMin ?? t.startMin,
    durMin: ex?.durMin ?? t.durMin,
    title: ex?.title ?? t.title,
    link: ex?.link ?? t.link ?? null,
    notes: ex?.notes ?? t.notes ?? null,
    assigneeIds: assignees,
    edited: !!ex,
    done: (t.doneDates ?? []).includes(date),
    cancelled: false,
  };
}

/**
 * Every occurrence of every task between two dates, inclusive.
 *
 * RECURRENCE EXPANDS AT READ TIME. Nothing is materialised: a daily task is one
 * row, and the grid asks it what it does on each of seven days. Writing one row
 * per occurrence would make "change the whole series" a migration.
 *
 * `roster` is passed straight through to `occursOnDate`, so the working-week skip
 * is inherited rather than repeated — a grid, a cover board and a work list built
 * on this cannot disagree about which days a series runs.
 */
export function expandRange(
  tasks: ScheduleTask[],
  fromISO: string,
  toISO: string,
  roster?: SchedUser[] | null,
): ScheduleOccurrence[] {
  const from = dayNumber(fromISO);
  const to = dayNumber(toISO);
  const out: ScheduleOccurrence[] = [];
  for (let n = from; n <= to; n++) {
    const date = isoOfDayNumber(n);
    for (const t of tasks) {
      const occ = occursOnDate(t, date, roster);
      if (occ) out.push(occ);
    }
  }
  return out;
}

/**
 * TJ's lane model, ported verbatim.
 *
 * Every tile keeps ONE standard width; a day with parallel work opens extra lanes
 * and the whole COLUMN widens instead of squeezing tiles. Sequential tasks reuse
 * lane 0, so an overlap-free day stays single-lane.
 *
 * `VIS_MIN` is a 25-minute VISUAL floor so back-to-back short tasks do not bleed
 * into each other — the data never uses it, and a 15-minute task is still 15
 * minutes long everywhere else.
 */
export function layoutLanes(occs: ScheduleOccurrence[]): {
  occs: ScheduleOccurrence[];
  lanes: number;
} {
  const VIS_MIN = 25;
  const laneEnds: number[] = [];
  const ordered = [...occs].sort((a, b) => a.startMin - b.startMin);

  for (const o of ordered) {
    let li = 0;
    while (laneEnds[li] != null && (laneEnds[li] as number) > o.startMin) li++;
    laneEnds[li] = o.startMin + Math.max(o.durMin, VIS_MIN);
    o.lane = li;
  }
  const n = Math.max(1, laneEnds.length);
  for (const o of ordered) o.lanes = n;
  return { occs: ordered, lanes: n };
}

/* ------------------------------------------------------------- acceptance */

export const RESP = {
  accepted: { label: 'Accepted', cls: 'ok' },
  declined: { label: 'Declined', cls: 'bad' },
  hold: { label: 'Hold', cls: 'warn' },
  resched: { label: 'New time', cls: 'info' },
} as const;

export type RespState = keyof typeof RESP;
export const RESP_KEYS = Object.keys(RESP) as RespState[];

/**
 * A task needing acceptance: more than one pair of hands, or ANY group.
 *
 * A group counts even when it currently resolves to one person — membership is
 * live, and a task that quietly stopped needing acceptance because a bench
 * shrank to one would start needing it again on the next hire.
 */
export function isGroupTask(t: Pick<ScheduleTask, 'groupIds'>, people: string[]): boolean {
  return (t.groupIds ?? []).length > 0 || people.length > 1;
}

export interface RespSummary {
  total: number;
  accepted: number;
  confirmed: boolean;
}

/** `0/2`, and whether the tile is drawn solid. */
export function respSummary(
  people: string[],
  responses: Record<string, RespState | undefined>,
): RespSummary {
  const accepted = people.filter((id) => responses[id] === 'accepted').length;
  return { total: people.length, accepted, confirmed: people.length > 0 && accepted === people.length };
}

/* ---------------------------------------------------------------- groups */

export interface RoleGroup {
  id: string;
  name: string;
  /** `null` means every active staff member. */
  roles: string[] | null;
}

/**
 * The eight role groups, in the demo's order.
 *
 * Tasks store group IDS, never member lists, so membership stays live —
 * reallocate a pod and its meetings follow. The per-client pod groups
 * (`g-pod-<clientId>`) are built at read time from PodSeat and are not here.
 */
export const ROLE_GROUPS: readonly RoleGroup[] = [
  { id: 'g-all', name: 'Whole team', roles: null },
  { id: 'g-ops', name: 'Operations', roles: ['admin', 'opsmgr', 'opshead'] },
  { id: 'g-core', name: 'Management · Core', roles: ['core'] },
  { id: 'g-doc', name: 'Doctors', roles: ['doctor'] },
  { id: 'g-diet', name: 'Dietitians', roles: ['dietitian'] },
  { id: 'g-fit', name: 'Fitness team', roles: ['fitness'] },
  { id: 'g-yoga', name: 'Yoga team', roles: ['yoga'] },
  { id: 'g-mind', name: 'Mind wellness', roles: ['mind'] },
];

export const POD_GROUP_PREFIX = 'g-pod-';

export function podGroupId(clientId: string): string {
  return POD_GROUP_PREFIX + clientId;
}

export function clientIdOfPodGroup(groupId: string): string | null {
  return groupId.startsWith(POD_GROUP_PREFIX) ? groupId.slice(POD_GROUP_PREFIX.length) : null;
}

/** Is this a group id the system knows about at all? */
export function isKnownGroupId(groupId: string): boolean {
  return ROLE_GROUPS.some((g) => g.id === groupId) || groupId.startsWith(POD_GROUP_PREFIX);
}

/* ------------------------------------------------------------ who-colours */

/**
 * The twelve person colours, assigned by seat with a stride of 5.
 *
 * Stride 5 against 12 slots walks the whole ring before repeating (5 and 12 are
 * coprime), so the first few people on a grid get colours that are far apart
 * rather than three neighbouring greens.
 */
export const WHO_COLOURS = 12;
export const WHO_STRIDE = 5;

export function whoIndex(seat: number): number {
  return ((seat * WHO_STRIDE) % WHO_COLOURS) + 1;
}

/* ------------------------------------------------------------ refusals */

/**
 * The refusal, in words — `blockWords` (console-schedule.js:380-386).
 *
 * IN SHARED, so the sentence the server refuses with and the sentence the task
 * sheet shows while you are still typing are the same string built by the same
 * function. The demo has them in one file and can afford to; split across a wire,
 * two copies would drift and a coach would read one reason and be given another.
 *
 * `detail` is the conflict's own words: the task title for a clash, the declared
 * window for an hours refusal, and a fixed phrase for leave.
 *
 * `on` NAMES THE DAY, and is set only when the day that failed is not the day
 * being asked about — a recurring booking is checked against its next fourteen
 * occurrences, so "Anita R. is off that day" arrives in front of a sheet showing
 * Friday and tells the booker nothing they can act on. Without it every sentence
 * below is word for word what it has always been, which is the point: the
 * single-occurrence wording is the common case and it did not need fixing.
 */

/** ` on Sun 6 Sep`, or nothing at all when the day is the one being asked about. */
function onDay(on: string | null | undefined): string {
  return on ? ` on ${dayLabel(on)}` : '';
}

/**
 * An hours refusal in its own words, pointed at a named day when there is one.
 *
 * `OFF_ALL_DAY` is REPLACED rather than trailed: "is off that day" points at
 * whatever day the reader is looking at, and "is off that day on Sun 6 Sep" is
 * worse than either half. A declared window is a fact rather than a pointer, so
 * it simply takes the day after it — "works 9:00 am-5:00 pm on Sun 6 Sep".
 */
function hoursWords(c: { detail: string; on?: string | null }): string {
  if (!c.on) return c.detail;
  return c.detail === OFF_ALL_DAY ? `is off${onDay(c.on)}` : `${c.detail}${onDay(c.on)}`;
}

export interface ConflictWords {
  type: string;
  who: string;
  detail: string;
  /** The day that failed, when it is not the day being asked about. */
  on?: string | null;
}

export function blockWords(c: ConflictWords): string {
  if (c.type === 'busy') {
    return `Blocked — ${c.who} already holds “${c.detail}”${onDay(c.on)}. Tick “allow overlap” on the task to run both.`;
  }
  if (c.type === 'leave') {
    return `Blocked — ${c.who} is on approved leave${c.on ? onDay(c.on) : ' that day'}.`;
  }
  return `Blocked — ${c.who} ${hoursWords(c)}.`;
}

/** The same refusal as a live hint under the time fields — `clashWords`. */
export function clashWords(list: ConflictWords[]): string {
  const head = list
    .slice(0, 3)
    .map((c) =>
      c.type === 'busy'
        ? `${c.who} already holds “${c.detail}”${onDay(c.on)}`
        : c.type === 'leave'
          ? `${c.who} is on approved leave${onDay(c.on)}`
          : `${c.who} ${hoursWords(c)}`,
    )
    .join(' · ');
  return head + (list.length > 3 ? ` · +${list.length - 3} more` : '');
}
