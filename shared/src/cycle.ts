/**
 * The programme's shape — ported from `HV.shape()` and its readers (core.js:169)
 * plus `HV.termOf` / `HV.ageOf`.
 *
 * One question — "how long is a cycle, and how many levels are there?" — used to
 * be answered by about sixty literals scattered across the demo, which is why
 * Configuration -> Program could be edited without anything moving. It is
 * answered here once.
 *
 * THE RULE THAT KEEPS A RUNTIME EDIT SAFE: config decides what gets BUILT, the
 * data decides what gets DRAWN. A cycle recorded at 11 days must still draw 11
 * cells after the programme moves to 14, so anything rendering a stored cycle
 * counts that cycle's own days rather than asking here.
 *
 * There is NO headline level (TJ, 16 Aug 2026 — the lowest-pillar rule is
 * retired): the four pillar levels are the whole reading, and nothing in this
 * file or anywhere else may reduce them to one number.
 */

export interface ProgramShape {
  /** How many levels a client climbs. */
  levels: number;
  /** Days in one cycle. */
  cycleDays: number;
  /** The day the level review is compiled. */
  reviewDay: number;
  /** Days with no prescribed sessions. Active rest is still the session. */
  restDays: readonly number[];
  /** The day the review meeting happens and the cycle closes. */
  meetingDay: number;
  /** The ENGAGEMENT clock — what the client paid for. A different clock. */
  termDays: number;
  /** Sessions expected per cycle, by staff role key. */
  sessions: { fitness: number; yoga: number; mind: number };
}

/**
 * THE one literal statement of the programme's shape, matching the demo's
 * `SHAPE` in data.js:25. Configuration may override it per deployment; every
 * reader goes through `shape()` so a runtime edit moves the whole product.
 */
export const DEFAULT_SHAPE: ProgramShape = {
  levels: 7,
  cycleDays: 14,
  reviewDay: 12,
  restDays: [5, 10],
  meetingDay: 14,
  termDays: 90,
  sessions: { fitness: 5, yoga: 3, mind: 1 },
};

/**
 * Resolve the live shape. Pass the stored programme config where one exists;
 * absent, the default stands — the same store-then-seed fallback `HV.shape()`
 * keeps, and for the same reason: the shape is read before any store is loaded.
 */
export function shape(override?: Partial<ProgramShape> | null): ProgramShape {
  if (!override) return DEFAULT_SHAPE;
  return { ...DEFAULT_SHAPE, ...override };
}

export function cycleDays(o?: Partial<ProgramShape> | null): number {
  return shape(o).cycleDays;
}
export function levels(o?: Partial<ProgramShape> | null): number {
  return shape(o).levels;
}
export function reviewDay(o?: Partial<ProgramShape> | null): number {
  return shape(o).reviewDay;
}
export function meetingDay(o?: Partial<ProgramShape> | null): number {
  return shape(o).meetingDay;
}
export function termDays(o?: Partial<ProgramShape> | null): number {
  return shape(o).termDays;
}
export function isRest(day: number, o?: Partial<ProgramShape> | null): boolean {
  return shape(o).restDays.includes(day);
}
export function levelList(o?: Partial<ProgramShape> | null): number[] {
  const n = levels(o);
  const out: number[] = [];
  for (let i = 1; i <= n; i++) out.push(i);
  return out;
}

/* ------------------------------------------------------------------ copy */

/**
 * Sentences that state the shape, so a screen never rebuilds one. Plain strings
 * here — the demo's versions interpolate `<span class="num">` because they are
 * written straight into innerHTML; the React port applies the data face with the
 * `num` class at the component instead.
 */
export const copy = {
  dayOf: (day: number, o?: Partial<ProgramShape> | null) => `Day ${day} of ${cycleDays(o)}`,
  cycleWord: (o?: Partial<ProgramShape> | null) => `${cycleDays(o)}-day`,
  reviewWord: (o?: Partial<ProgramShape> | null) => `Day-${reviewDay(o)}`,
  meetingWord: (o?: Partial<ProgramShape> | null) => `Day-${meetingDay(o)}`,
  journeyLine: (o?: Partial<ProgramShape> | null) =>
    `${levels(o)} levels x ${cycleDays(o)} days each — about ${levels(o) * cycleDays(o)} days`,
};

/* ------------------------------------------------------- dates and terms */

/**
 * Dates go through these rather than `toISOString()`: that converts to UTC
 * first, so local midnight in IST reports as the previous day — a term would end
 * a day early and every night would misreport for five and a half hours.
 */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function dateAdd(iso: string, days: number): string {
  const [y, m, d] = String(iso).split('-').map(Number);
  return toISODate(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + (days || 0)));
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = String(fromISO).split('-').map(Number);
  const b = String(toISO).split('-').map(Number);
  const from = new Date(a[0] ?? 1970, (a[1] ?? 1) - 1, a[2] ?? 1);
  const to = new Date(b[0] ?? 1970, (b[1] ?? 1) - 1, b[2] ?? 1);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export interface TermInput {
  term?: { days?: number | null; startISO?: string | null; renewals?: unknown[] } | null;
  joinedISO?: string | null;
}

export interface TermReading {
  days: number;
  startISO: string;
  endISO: string;
  elapsed: number;
  /** NOT clamped: a term that ended nine days ago has to be able to say so. */
  left: number;
  pct: number;
  ended: boolean;
  renewals: unknown[];
}

/**
 * The SECOND clock. The programme runs 7 levels x 14 days = 98 days; the term a
 * client paid for is 90. They are different clocks and the screen must never let
 * them be confused — a client mid-level with two weeks of term left is an
 * ordinary state, not an error. Both are always LABELLED; neither ever shows a
 * bare number. `HV.termOf`.
 */
export function termOf(
  c: TermInput | null | undefined,
  o?: Partial<ProgramShape> | null,
  now: Date = new Date(),
): TermReading {
  const t = c?.term ?? {};
  const days = t.days ?? termDays(o);
  const startISO = t.startISO ?? c?.joinedISO ?? todayISO(now);
  const endISO = dateAdd(startISO, days);
  /* elapsed is clamped into the term so a stale start date cannot draw a
     negative bar or one past 100% — but `left` is deliberately not. */
  const raw = daysBetween(startISO, todayISO(now));
  const elapsed = Math.max(0, Math.min(days, raw));
  return {
    days,
    startISO,
    endISO,
    elapsed,
    left: days - raw,
    pct: Math.round((elapsed / days) * 100),
    ended: raw >= days,
    renewals: t.renewals ?? [],
  };
}

/**
 * Age is DERIVED, never typed — two numbers that must agree eventually disagree.
 * A stored age survives only as the fallback for a record with no date of birth.
 * `HV.ageOf`.
 */
export function ageOf(
  c: { dob?: string | null; age?: number | null } | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!c) return null;
  if (!c.dob) return c.age ?? null;
  return Math.max(0, Math.floor((now.getTime() - new Date(c.dob).getTime()) / 31_557_600_000));
}

/* ----------------------------------------------------- celebrations */

export interface CelebrationSource {
  clientId: string;
  /** ISO date. Birthdays. */
  dob?: string | null;
  /** ISO date. The SECOND date — anniversaries, which `dob` alone would drop. */
  anniv?: string | null;
}

export interface Celebration {
  clientId: string;
  kind: 'birthday' | 'anniversary';
  /** THIS year's occurrence, not the original date. */
  dateISO: string;
  inDays: number;
}

/**
 * Birthdays and anniversaries falling in the next `days`. `HV.upcomingCelebrations`.
 *
 * The YEAR is rewritten to the next occurrence, so a 1980 birthday sorts beside a
 * 2019 anniversary instead of forty years behind it — and a date already past
 * this year rolls to the next. Sorted soonest first, which is the order the strip
 * reads in.
 *
 * Pure: `now` is injected rather than read, so a test can sit on a birthday.
 */
export function upcomingCelebrations(
  clients: readonly CelebrationSource[],
  days = 7,
  now: Date = new Date(),
): Celebration[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: Celebration[] = [];

  for (const c of clients) {
    for (const [field, kind] of [
      ['dob', 'birthday'],
      ['anniv', 'anniversary'],
    ] as const) {
      const src = c[field];
      if (!src) continue;
      const p = String(src).slice(0, 10).split('-').map(Number);
      const m = (p[1] ?? 1) - 1;
      const d = p[2] ?? 1;

      let next = new Date(today.getFullYear(), m, d);
      if (next < today) next = new Date(today.getFullYear() + 1, m, d);

      const inDays = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      if (inDays <= days) {
        out.push({ clientId: c.clientId, kind, dateISO: toISODate(next), inDays });
      }
    }
  }

  return out.sort((a, b) => a.inDays - b.inDays);
}
