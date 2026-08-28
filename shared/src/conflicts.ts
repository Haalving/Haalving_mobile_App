/**
 * The conflict engine — ported from core.js:283-486 (`HV.conflicts`, `HV.busyAt`,
 * `HV.outsideHours`, `HV.onLeaveAt`, `HV.availWindows`, `HV.availFits`,
 * `HV.occursOn`, `HV.firstFreeSlot`).
 *
 * "Can this person be here, then?" asked in ONE place. NOTHING may put a person
 * in a slot without asking first — the seed's booking generator, the Schedule
 * sheet, both drag paths and the leave cover board all consult it, and so does
 * every API write in the port.
 *
 * Every function takes its world in `w` and holds no module state, so a caller
 * that needs to move the clock can. That is not a nicety: a rule whose whole job
 * is reading the time cannot be verified by a caller that cannot move it.
 *
 * THREE DISTINCTIONS ARE LOAD-BEARING, and each exists because collapsing it
 * broke something real:
 *
 *  - `allowOverlap` needs BOTH sides (TJ, 17 Aug 2026). Overlap is refused
 *    unless the incoming task and every task it lands on both permit it.
 *  - `rhythm` is not an appointment. A standing to-do pinned to a nominal hour
 *    holds no capacity and blocks none, in either direction.
 *  - `hoursFor` narrows the declared-hours check to the people NAMED on a task.
 *    You can refuse to put a named person somewhere; you cannot refuse to invite
 *    a team. No hour satisfies twelve windows at once (Lakshmi finishes at 12:00,
 *    Meera starts at 14:00), so enforcing hours on group invitees makes the SOP
 *    unschedulable. Busy and on-leave still bind everyone.
 */

/* ------------------------------------------------------------ time helpers */

/** Weekday keys, indexed the way `Date#getDay()` returns. */
export const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WD)[number];

/** `'HH:MM'` -> minutes-of-day, or null when it is not a clock. */
export function hmToMin(hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? ''));
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 1440 ? mins : null;
}

/** minutes-of-day -> `'6:30 am'`, the clock voice the schedule speaks. */
export function fmtTime(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const mm = v % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')}${h < 12 ? ' am' : ' pm'}`;
}

/** The weekday `rd` days from `now`. Day 0 is today, -1 yesterday. */
export function wdOf(rd: number, now: Date = new Date()): Weekday {
  const d = new Date(now.getTime() + rd * 86_400_000);
  return WD[d.getDay()] as Weekday;
}

function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The ISO date `rd` days from `now`, in LOCAL time. Never via toISOString(). */
export function isoOfRd(rd: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + rd);
  return toISODate(d);
}

/* -------------------------------------------------------------- the world */

/**
 * A weekday holds ONE range or SEVERAL:
 *
 *     mon: ['09:00','17:00']                        one window
 *     mon: [['06:00','10:00'],['17:00','21:00']]    two — a split shift
 *     mon: null / absent                            off
 *
 * A personal trainer with six one-on-ones works early mornings and evenings with
 * nothing between, and five and a half hours of sessions fit in no single window.
 * Both shapes are read, so no stored record needs migrating.
 */
export type AvailRange = [string, string];
export type AvailDay = AvailRange | AvailRange[] | null | undefined;
export type Availability = Partial<Record<Weekday, AvailDay>>;

export interface SchedUser {
  id: string;
  name: string;
  /** The AI keeps no hours and cannot be double-booked. */
  ai?: boolean;
  inactive?: boolean;
  avail?: Availability | null;
}

export interface Recurrence {
  freq: 'daily' | 'alt' | 'weekly';
  /** Last `rd` the series runs, inclusive. Null runs forever. */
  until?: number | null;
}

export interface TaskException {
  cancelled?: boolean;
  start?: number | null;
  dur?: number | null;
  title?: string;
  link?: string | null;
  notes?: string | null;
  assignees?: string[];
}

export interface SchedTask {
  id: string;
  title: string;
  /** Days RELATIVE to today. 0 is today, -1 yesterday. */
  day: number;
  /** Minutes-of-day. */
  start: number;
  /** Minutes. */
  dur: number;
  assignees?: string[];
  recur?: Recurrence | null;
  exc?: Record<number, TaskException> | null;
  done?: Record<number, boolean> | null;
  /**
   * A standing to-do pinned to a nominal hour — the daily reminder sweep, the
   * photo follow-ups. NOT an appointment: it holds no capacity and blocks none,
   * in either direction. Distinct from `allowOverlap`, which is two APPOINTMENTS
   * agreeing to run side by side and therefore needs both of them to say so.
   */
  rhythm?: boolean;
  allowOverlap?: boolean;
  link?: string | null;
  notes?: string | null;
}

export interface Leave {
  staffId: string;
  status: string;
  /** Inclusive ISO dates. */
  from: string;
  to: string;
}

export interface Occurrence {
  t: SchedTask;
  rd: number;
  start: number;
  dur: number;
  title: string;
  link: string | null;
  notes: string | null;
  /**
   * A per-occurrence coach swap. This is how an approved leave cover reaches the
   * grid, the digest, the reminder sweep AND the client's plan from a single
   * write — every one of them reads the occurrence. Without it the cover moved
   * the SEAT while the appointment kept the absent coach's name.
   */
  assignees: string[];
  edited: boolean;
  done: boolean;
}

export interface World {
  tasks?: SchedTask[];
  users?: SchedUser[];
  leaves?: Leave[];
  /** Task ids to ignore — a task being moved must not clash with itself. */
  exceptIds?: string[];
  /** The INCOMING task's own permission. Overlap still needs both sides. */
  allowOverlap?: boolean;
  /** The caller's own group resolver. Group expansion is view logic. */
  peopleOf?: (t: SchedTask, occ: Occurrence) => string[];
  /** Narrows the declared-hours check. Defaults to everyone asked about. */
  hoursFor?: string[];
  /** The clock. Injected so a test can move it. */
  now?: Date;
}

interface ResolvedWorld extends Required<Omit<World, 'hoursFor'>> {
  hoursFor?: string[];
}

function resolve(w: World | undefined): ResolvedWorld {
  const o = w ?? {};
  return {
    tasks: o.tasks ?? [],
    users: o.users ?? [],
    leaves: o.leaves ?? [],
    exceptIds: o.exceptIds ?? [],
    allowOverlap: !!o.allowOverlap,
    peopleOf: o.peopleOf ?? ((t, occ) => occ?.assignees ?? t.assignees ?? []),
    now: o.now ?? new Date(),
    ...(o.hoursFor ? { hoursFor: o.hoursFor } : {}),
  };
}

function userIn(w: ResolvedWorld, id: string): SchedUser | null {
  return w.users.find((u) => u.id === id) ?? null;
}
function nameIn(w: ResolvedWorld, id: string): string {
  return userIn(w, id)?.name ?? id;
}

/* ----------------------------------------------------------- availability */

/**
 * Read declared hours ONLY through this. Every helper that indexed `win[0]` /
 * `win[1]` directly returned *nothing* for a split shift, silently.
 * Returns minute pairs, sorted, with malformed ranges dropped.
 */
export function availWindows(user: SchedUser | null | undefined, wdKey: Weekday): Array<[number, number]> {
  const day = user?.avail?.[wdKey];
  if (!day || !Array.isArray(day) || day.length === 0) return [];
  /* one range is a pair of strings; several is an array of pairs */
  const raw: AvailRange[] = Array.isArray(day[0]) ? (day as AvailRange[]) : [day as AvailRange];
  return raw
    .map((win) => [hmToMin(win[0]), hmToMin(win[1])] as [number | null, number | null])
    .filter((win): win is [number, number] => win[0] != null && win[1] != null && win[1] > win[0])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * ONE window must hold the WHOLE session. A session straddling the gap in a
 * split shift is not "inside declared hours" — it is two half-sessions with the
 * coach's lunch in the middle.
 */
export function availFits(
  user: SchedUser | null | undefined,
  wdKey: Weekday,
  start: number,
  dur: number,
): boolean {
  if (!user || user.ai) return true; /* the AI keeps no hours */
  if (!user.avail) return true; /* nobody has declared any */
  return availWindows(user, wdKey).some((w) => start >= w[0] && start + dur <= w[1]);
}

/* -------------------------------------------------------------- occurrence */

/**
 * Does this task happen on relative day `rd`, and if so with what edits?
 *
 * The scheduled task lives on a days-relative-to-today axis; the derived
 * calendar lives on a cycle-day axis. These are the app's two clocks and this is
 * the only place they are reconciled. Recurrence is model logic — three private
 * copies of this arithmetic had already drifted in the demo before it moved here.
 */
export function occursOn(t: SchedTask, rd: number): Occurrence | null {
  let hit = false;
  if (!t.recur) {
    hit = t.day === rd;
  } else if (rd >= t.day && (t.recur.until == null || rd <= t.recur.until)) {
    const gap = rd - t.day;
    hit = t.recur.freq === 'daily' ? true : t.recur.freq === 'alt' ? gap % 2 === 0 : gap % 7 === 0;
  }
  if (!hit) return null;

  const ex = t.exc?.[rd];
  if (ex?.cancelled) return null;

  return {
    t,
    rd,
    start: ex && ex.start != null ? ex.start : t.start,
    dur: ex && ex.dur != null ? ex.dur : t.dur,
    title: ex?.title ? ex.title : t.title,
    link: ex && ex.link != null ? ex.link : (t.link ?? null),
    notes: ex && ex.notes != null ? ex.notes : (t.notes ?? null),
    assignees: ex?.assignees ? ex.assignees : (t.assignees ?? []),
    edited: !!ex,
    done: !!t.done?.[rd],
  };
}

/* --------------------------------------------------------------- conflicts */

export type ConflictType = 'busy' | 'hours' | 'leave';

export interface Conflict {
  type: ConflictType;
  whoId: string;
  who: string;
  detail: string;
  taskId?: string;
}

/**
 * Who already holds these minutes. An overlap is permitted only when the
 * INCOMING task and EVERY task it lands on both allow it — a task that permits
 * overlap cannot force itself on top of one that does not.
 */
export function busyAt(
  people: string[],
  rd: number,
  start: number,
  dur: number,
  w?: World,
): Conflict[] {
  const world = resolve(w);
  const out: Conflict[] = [];
  world.tasks.forEach((t) => {
    if (world.exceptIds.includes(t.id)) return;
    if (t.rhythm) return; /* holds no capacity and blocks none */
    const occ = occursOn(t, rd);
    if (!occ) return;
    if (occ.start + occ.dur <= start || occ.start >= start + dur) return;
    if (world.allowOverlap && t.allowOverlap) return;
    world.peopleOf(t, occ).forEach((id) => {
      if (!people.includes(id)) return;
      if (out.some((x) => x.whoId === id && x.taskId === t.id)) return;
      out.push({ type: 'busy', whoId: id, who: nameIn(world, id), detail: occ.title, taskId: t.id });
    });
  });
  return out;
}

/** Who is not working then, by their own declared week. */
export function outsideHours(
  people: string[],
  rd: number,
  start: number,
  dur: number,
  w?: World,
): Conflict[] {
  const world = resolve(w);
  const wd = wdOf(rd, world.now);
  const out: Conflict[] = [];
  people.forEach((id) => {
    const u = userIn(world, id);
    if (!u || u.ai || !u.avail) return;
    if (availFits(u, wd, start, dur)) return;
    const win = availWindows(u, wd);
    out.push({
      type: 'hours',
      whoId: id,
      who: u.name,
      detail: win.length
        ? `works ${win.map((v) => `${fmtTime(v[0])}-${fmtTime(v[1])}`).join(' and ')}`
        : 'is off that day',
    });
  });
  return out;
}

/** Who is on approved leave that day. */
export function onLeaveAt(people: string[], rd: number, w?: World): Conflict[] {
  const world = resolve(w);
  const iso = isoOfRd(rd, world.now);
  const out: Conflict[] = [];
  people.forEach((id) => {
    const lv = world.leaves.find(
      (l) => l.staffId === id && l.status === 'approved' && l.from <= iso && iso <= l.to,
    );
    if (lv) out.push({ type: 'leave', whoId: id, who: nameIn(world, id), detail: 'on approved leave' });
  });
  return out;
}

/**
 * The union, most-blocking first.
 *
 * `hoursFor` narrows WHO the declared-hours check applies to and defaults to
 * everyone. The distinction is real: you can refuse to put a NAMED PERSON
 * somewhere, but you cannot refuse to INVITE A TEAM. Being booked and being on
 * leave still apply to everybody — those are facts about the person, not about
 * who invited them.
 */
export function conflicts(
  people: string[],
  rd: number,
  start: number,
  dur: number,
  w?: World,
): Conflict[] {
  const hoursFor = w?.hoursFor ?? people;
  return busyAt(people, rd, start, dur, w)
    .concat(onLeaveAt(people, rd, w))
    .concat(outsideHours(hoursFor, rd, start, dur, w));
}

/**
 * The earliest minute a recurring session can sit on EVERY day it runs.
 *
 * `rds` is a LIST, not a day: a series that clears Tuesday may be outside a
 * narrower Saturday window, and the caller must not discover that a week later.
 * Days the person does not work at all are skipped rather than fatal — a coach's
 * day off removes that occurrence, it does not cancel the series.
 *
 * `from` is a preference, not a promise. When the preferred stretch fills, the
 * search spills back through the rest of the working day.
 *
 * `null` is a real answer: the series cannot be placed, and the caller must say
 * so rather than booking a coach who has gone home.
 */
export function firstFreeSlot(
  personId: string,
  rds: number[],
  dur: number,
  w?: World & { step?: number; from?: number },
): number | null {
  const world = resolve(w);
  const step = w?.step ?? 15;
  const user = userIn(world, personId);
  const days = (rds ?? []).filter((rd) => availWindows(user, wdOf(rd, world.now)).length > 0);
  if (!days.length) return null;

  /* candidate minutes: every window on every day, on the step grid, deduped */
  const seen = new Set<number>();
  const cands: number[] = [];
  days.forEach((rd) => {
    availWindows(user, wdOf(rd, world.now)).forEach((win) => {
      for (let m = Math.ceil(win[0] / step) * step; m + dur <= win[1]; m += step) {
        if (!seen.has(m)) {
          seen.add(m);
          cands.push(m);
        }
      }
    });
  });

  const from = w?.from ?? 0;
  /* at or after the preference first, in time order; then everything before it */
  cands.sort((a, b) => (a >= from ? 0 : 1) - (b >= from ? 0 : 1) || a - b);

  const hit = cands.find((m) => days.every((rd) => conflicts([personId], rd, m, dur, w).length === 0));
  return hit == null ? null : hit;
}
