/**
 * THE CYCLE CALENDAR — ported from `HV.calendarFor` and its helpers (demo
 * core.js:648, 298, 531, 3161, 3164).
 *
 * One entry per cycle-day: the sessions prescribed by the client's assigned
 * template, reconciled with the coach's bookings, plus the day's meal slots and
 * the shape's rest/review/meeting flags. Pure — the caller passes the shape, the
 * plan assignments, the templates, the bookings and the completion log, and this
 * decides what each day holds. The backend composes the inputs from
 * `config.getShape()`, the `ClientPlan` rows, the `PlanTemplate` days, the session
 * `Task`s and `TaskDone`; a test pins the whole thing with plain objects.
 *
 * THE STATUS DEFAULT, verbatim: a day with no explicit log entry reads `done`
 * before today, `today` on the client's day, `planned` after — which is exactly
 * the plan hub's ok / up / miss once mapped.
 */

import { SESSION_PILLARS } from './pillars.js';

/** A template slot. The plan hub reads only whether one exists and its label/time. */
export interface CalSlot {
  label?: string;
  time?: string;
  options?: unknown;
}

/** One pillar's assignment — the demo's `clientPlans[client][pillar]`. */
export interface Assignment {
  templateId: string | null;
  /** `{ [day]: { slots } }`; a null `slots` means the override clears the day. */
  overrides?: Record<string, { slots?: CalSlot[] | null }> | null;
  /** the client's own hour for this pillar, "6:30" */
  time?: string | null;
}

/** A plan template — `PlanTemplate.days`, keyed by day number. */
export interface CalTemplate {
  days?: Record<string, { slots?: CalSlot[] }> | null;
}

/** A coach booking on a cycle-day, already resolved from the session Tasks. */
export interface CalBooking {
  pillar: string;
  /** the coach's own title, when they typed one that differs from the template's */
  title?: string | null;
  time: string;
  staffId: string | null;
}

/** One completion-log entry — the demo's `client.sessionLog`, from TaskDone. */
export interface SessionLogEntry {
  cy: number;
  d: number;
  pillar: string;
  status: string;
}

export interface CalItem {
  pillar: string;
  day: number;
  label: string;
  time: string;
  staffId: string | null;
  booked: boolean;
  unprescribed?: boolean;
  status: string;
}

export interface CalDay {
  day: number;
  date: string;
  today: boolean;
  rest: boolean;
  review: boolean;
  meeting: boolean;
  items: CalItem[];
  meals: CalSlot[];
}

/* -------------------------------------------------- the four helpers, pure */

/** The client's assignment for a pillar, or null when the pillar is unassigned. */
export function assignment(
  plans: Record<string, Assignment> | null | undefined,
  pillar: string,
): Assignment | null {
  return (plans && plans[pillar]) || null;
}

/**
 * The prescribed slots for a pillar on a cycle-day: a day-level override wins over
 * the template's own day, and an unassigned pillar has none.
 */
export function slotsFor(
  a: Assignment | null,
  templates: Record<string, CalTemplate>,
  day: number,
): CalSlot[] {
  if (!a) return [];
  const ov = a.overrides?.[String(day)];
  if (ov && ov.slots) return ov.slots;
  const t = a.templateId ? templates[a.templateId] : null;
  return t?.days?.[String(day)]?.slots ?? [];
}

/** The recorded status for one (cycle, day, pillar), or null — the latest wins. */
export function sessionStatus(
  log: SessionLogEntry[],
  cycle: number,
  day: number,
  pillar: string,
): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e && e.cy === cycle && e.d === day && e.pillar === pillar) return e.status;
  }
  return null;
}

/* --------------------------------------------------------------- the calendar */

export interface CalendarInput {
  cycle: number;
  /** the client's current cycle-day */
  clientDay: number;
  shape: { cycleDays: number; restDays: readonly number[]; reviewDay: number; meetingDay: number };
  plans: Record<string, Assignment>;
  templates: Record<string, CalTemplate>;
  /** every booking on each cycle-day, keyed by day — resolved from session Tasks */
  bookingsByDay: Record<number, CalBooking[]>;
  sessionLog: SessionLogEntry[];
  /** the staff id holding a pillar's seat today (cover-aware) */
  staffFor: (pillar: string) => string | null;
  /** the pillar's fallback slot word, e.g. "Session" */
  slotWord: (pillar: string) => string;
  /** a month-day label ("Sep 2") for a day this many days from the client's today */
  fmtDate: (dayOffset: number) => string;
}

/** The whole cycle, one entry per day. */
export function calendarFor(input: CalendarInput): CalDay[] {
  const { cycle, clientDay, shape, plans, templates, bookingsByDay, sessionLog } = input;
  const rest = shape.restDays ?? [];
  const out: CalDay[] = [];

  const statusOf = (d: number, p: string): string =>
    sessionStatus(sessionLog, cycle, d, p) ||
    (d < clientDay ? 'done' : d === clientDay ? 'today' : 'planned');

  for (let d = 1; d <= shape.cycleDays; d++) {
    const items: CalItem[] = [];
    const claimed: Record<string, boolean> = {};
    const dayBookings = bookingsByDay[d] ?? [];
    const bookingForPillar = (p: string) => dayBookings.find((b) => b.pillar === p) ?? null;

    for (const p of SESSION_PILLARS) {
      const a = assignment(plans, p);
      const own = a?.time ?? null;
      for (const slot of slotsFor(a, templates, d)) {
        /* THE RECONCILIATION: the template prescribes WHAT and WHICH DAY; a
           booking decides WHEN and WITH WHOM, and the booking wins — the client
           attends the appointment, not the prescription. A per-day title the coach
           typed themselves still wins on WHAT. */
        const b = bookingForPillar(p);
        if (b) claimed[p] = true;
        items.push({
          pillar: p,
          day: d,
          label: (b && b.title) || slot.label || input.slotWord(p),
          /* the clock, in three rungs: a booking, then the client's own hour, then
             the template's suggested time */
          time: b ? b.time : own ?? slot.time ?? '',
          staffId: b ? b.staffId : input.staffFor(p),
          booked: !!b,
          status: statusOf(d, p),
        });
      }
    }

    /* a booking the plan does not prescribe still belongs on the client's day */
    for (const b of dayBookings) {
      if (!SESSION_PILLARS.includes(b.pillar as (typeof SESSION_PILLARS)[number]) || claimed[b.pillar]) {
        continue;
      }
      items.push({
        pillar: b.pillar,
        day: d,
        label: b.title || input.slotWord(b.pillar),
        time: b.time,
        staffId: b.staffId,
        booked: true,
        unprescribed: true,
        status: statusOf(d, b.pillar),
      });
    }

    out.push({
      day: d,
      date: input.fmtDate(d - clientDay),
      today: d === clientDay,
      /* rest comes from CONFIG, full stop — a nightly wind-down does not stop a
         rest day being a rest day */
      rest: rest.includes(d),
      review: d === shape.reviewDay,
      meeting: d === shape.meetingDay,
      items,
      meals: slotsFor(assignment(plans, 'culture'), templates, d),
    });
  }

  return out;
}
