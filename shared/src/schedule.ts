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
 */
export function occursOnDate(t: ScheduleTask, date: string): ScheduleOccurrence | null {
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
 */
export function expandRange(
  tasks: ScheduleTask[],
  fromISO: string,
  toISO: string,
): ScheduleOccurrence[] {
  const from = dayNumber(fromISO);
  const to = dayNumber(toISO);
  const out: ScheduleOccurrence[] = [];
  for (let n = from; n <= to; n++) {
    const date = isoOfDayNumber(n);
    for (const t of tasks) {
      const occ = occursOnDate(t, date);
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
 */
export function blockWords(c: { type: string; who: string; detail: string }): string {
  if (c.type === 'busy') {
    return `Blocked — ${c.who} already holds “${c.detail}”. Tick “allow overlap” on the task to run both.`;
  }
  if (c.type === 'leave') return `Blocked — ${c.who} is on approved leave that day.`;
  return `Blocked — ${c.who} ${c.detail}.`;
}

/** The same refusal as a live hint under the time fields — `clashWords`. */
export function clashWords(list: Array<{ type: string; who: string; detail: string }>): string {
  const head = list
    .slice(0, 3)
    .map((c) =>
      c.type === 'busy'
        ? `${c.who} already holds “${c.detail}”`
        : c.type === 'leave'
          ? `${c.who} is on approved leave`
          : `${c.who} ${c.detail}`,
    )
    .join(' · ');
  return head + (list.length > 3 ? ` · +${list.length - 3} more` : '');
}
