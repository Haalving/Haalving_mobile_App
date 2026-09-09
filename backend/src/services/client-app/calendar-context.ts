import {
  calendarFor,
  pillarName,
  PILLAR_KEYS,
  type Assignment,
  type CalBooking,
  type CalDay,
  type CalTemplate,
  type SessionLogEntry,
} from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import { todayISO } from '../../utils/dates.js';
import * as config from '../config.service.js';

/**
 * THE CYCLE CALENDAR, BUILT ONCE.
 *
 * Both the plan hub and Today draw the same cycle — the demo warns that when the
 * two surfaces derive it apart they drift, so the plan showed one coach and Today
 * another. This module assembles everything the ported `calendarFor` needs from
 * the database and hands it back; `plan.ts` and `index.ts` both call it and cannot
 * disagree.
 *
 * IT TAKES THE POD SEATS AS AN ARGUMENT rather than importing `pod()`. `pod` lives
 * in `index.ts`, and `plan.ts` already imports it there; if this module imported it
 * too the graph would loop `index -> calendar-context -> index`. The caller has the
 * seats in hand already, so it passes them.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** minutes-since-midnight to "HH:MM", or "" when there is no time. */
export const hhmm = (m: number | null | undefined): string =>
  m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** "6:30" / "18:00" back to minutes-since-midnight, or null. */
export const hmToMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The handful of client fields the calendar needs — a subset of the plan/me rows. */
export type CalClient = {
  id: string;
  cycle: number;
  cycleDay: number;
  shapeVersion: number | null;
};

/** The pod seats, as `pod()` returns them — only the seat and the coach id are read. */
type Seats = ReadonlyArray<{ seat: string; coach: { id: string } | null }>;

/** The real session Task behind a booking, for Today's join/done overlay. */
export type BookingDetail = {
  id: string;
  link: string | null;
  durMin: number | null;
  startMin: number | null;
  done: boolean;
};

export type CalendarCtx = {
  shape: Awaited<ReturnType<typeof config.getShapeFor>>;
  plans: Record<string, Assignment>;
  templates: Record<string, CalTemplate>;
  bookingsByDay: Record<number, CalBooking[]>;
  sessionLog: SessionLogEntry[];
  staffFor: (pillar: string) => string | null;
  fmtDate: (dayOffset: number) => string;
  /** the Task behind a booking, keyed `${cycleDay}:${pillar}` — first booking wins */
  bookingDetail: Map<string, BookingDetail>;
};

/** pillar key -> the pod role seat that carries it (culture is the dietitian). */
const SEAT_OF: Record<string, string> = {
  fitness: 'fitness',
  yoga: 'yoga',
  wellness: 'mind',
  culture: 'dietitian',
};

/**
 * Assemble the calendar inputs: the shape, the PUBLISHED assignments, the templates
 * they name, the session bookings keyed by cycle-day, the completion log, and the
 * cover-aware seat resolver.
 */
export async function buildCalendarContext(c: CalClient, seats: Seats): Promise<CalendarCtx> {
  const shape = await config.getShapeFor(c);

  /* LIVE ROWS ONLY — the ones with a template approved onto them. A pillar that
     has been called but never approved has `templateId: null` and a ticket the
     console reads; the client's calendar must not know the ticket exists. */
  const cpRows = await prisma.clientPlan.findMany({
    where: { clientId: c.id, templateId: { not: null } },
    select: { pillar: true, templateId: true, overrides: true, time: true },
  });
  const plans: Record<string, Assignment> = {};
  for (const r of cpRows) {
    plans[r.pillar] = {
      templateId: r.templateId,
      overrides: (r.overrides as Assignment['overrides']) ?? {},
      time: r.time,
    };
  }

  const tplIds = [...new Set(cpRows.map((r) => r.templateId).filter((v): v is string => !!v))];
  const tplRows = tplIds.length
    ? await prisma.planTemplate.findMany({ where: { id: { in: tplIds } }, select: { id: true, days: true } })
    : [];
  const templates: Record<string, CalTemplate> = {};
  for (const t of tplRows) templates[t.id] = { days: (t.days as CalTemplate['days']) ?? {} };

  const bySeat = new Map(seats.map((s) => [s.seat, s.coach?.id ?? null]));
  const staffFor = (pillar: string): string | null => bySeat.get(SEAT_OF[pillar] ?? pillar) ?? null;

  /* the session bookings, keyed by the cycle-day they fall on. A one-off session
     Task carries an absolute date; its cycle-day is the client's current day plus
     the date's offset from today — the same sliding axis the demo keys on. */
  const today = new Date(`${todayISO()}T00:00:00.000Z`).getTime();
  const tasks = await prisma.task.findMany({
    where: { clientId: c.id, kind: 'SESSION' },
    select: {
      id: true,
      pillar: true,
      title: true,
      date: true,
      startMin: true,
      durMin: true,
      link: true,
      assigneeIds: true,
      dones: { select: { at: true } },
    },
    orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
  });
  const bookingsByDay: Record<number, CalBooking[]> = {};
  const sessionLog: SessionLogEntry[] = [];
  const bookingDetail = new Map<string, BookingDetail>();
  for (const t of tasks) {
    if (!t.date || !t.pillar) continue;
    const offset = Math.round((t.date.getTime() - today) / 86_400_000);
    const d = c.cycleDay + offset;
    (bookingsByDay[d] ??= []).push({
      pillar: t.pillar,
      title: t.title,
      time: hhmm(t.startMin),
      staffId: t.assigneeIds[0] ?? staffFor(t.pillar),
    });
    /* the join/done overlay Today needs — the first booking for a day+pillar wins,
       matching calendarFor's `.find` reconciliation */
    const key = `${d}:${t.pillar}`;
    if (!bookingDetail.has(key)) {
      bookingDetail.set(key, {
        id: t.id,
        link: t.link,
        durMin: t.durMin,
        startMin: t.startMin,
        done: t.dones.length > 0,
      });
    }
    if (t.dones.length) sessionLog.push({ cy: c.cycle, d, pillar: t.pillar, status: 'done' });
  }

  /*
   * WHAT THE CLIENT TICKED OFF THEMSELVES.
   *
   * Merged into the SAME log the booked sessions write into, because the grid, the
   * level-up engine and the coach's board all read this one list. A session the
   * client marked done and a session their coach ticked are the same fact about
   * the same half hour; keeping them apart would have meant two answers to "did
   * this happen".
   */
  const claimed = await prisma.clientSessionDone.findMany({
    where: { clientId: c.id, cycle: c.cycle, status: 'done' },
    select: { day: true, pillar: true },
  });
  for (const r of claimed) sessionLog.push({ cy: c.cycle, d: r.day, pillar: r.pillar, status: 'done' });

  const fmtDate = (dayOffset: number): string => {
    const dt = new Date(today + dayOffset * 86_400_000);
    return `${MON[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
  };

  return { shape, plans, templates, bookingsByDay, sessionLog, staffFor, fmtDate, bookingDetail };
}

/**
 * NEXT CYCLE, AS IT WILL BE — the same engine, pointed at the queued assignments.
 *
 * `clientDay: 0` so no day reads as today or past; no bookings and no session
 * log, because none exist for a cycle that has not started. The caller hands in
 * the plans with the queued templates substituted, and a `fmtDate` anchored on
 * the day the next cycle begins.
 */
export function buildNextCalendar(
  c: CalClient,
  ctx: CalendarCtx,
  plans: Record<string, Assignment>,
  templates: Record<string, CalTemplate>,
  fmtDate: (dayOffset: number) => string,
): CalDay[] {
  return calendarFor({
    cycle: c.cycle + 1,
    clientDay: 0,
    shape: ctx.shape,
    plans,
    templates,
    bookingsByDay: {},
    sessionLog: [],
    staffFor: ctx.staffFor,
    slotWord: (p) => `${pillarName(p)} session`,
    fmtDate,
  });
}

/**
 * THE QUEUED ASSIGNMENTS, SWAPPED IN — the one definition of "next cycle".
 *
 * The plan payload draws next cycle's grid from this, and the day endpoint
 * draws a next-cycle date's plate and sessions from it. Two callers, one
 * substitution, so the grid a client taps and the day that opens cannot come
 * from different plans. `has` is false when nothing is queued, and callers
 * then have no next cycle to show.
 */
export async function queuedAssignments(
  c: { id: string },
  ctx: CalendarCtx,
): Promise<{
  has: boolean;
  plans: Record<string, Assignment>;
  templates: Record<string, CalTemplate>;
  /** each queued pillar's level, read off its template — next cycle's own "Level N" */
  levels: Record<string, number>;
  /** the pillars with nothing queued: next cycle has no plan for them YET */
  unallocated: string[];
}> {
  const queued = await prisma.clientPlan.findMany({
    where: { clientId: c.id, queuedTemplateId: { not: null } },
    select: { pillar: true, queuedTemplateId: true, queuedOverrides: true, time: true },
  });
  if (!queued.length) return { has: false, plans: {}, templates: ctx.templates, levels: {}, unallocated: [...PILLAR_KEYS] };

  /*
   * ONLY WHAT IS QUEUED. This used to start from the live assignments and lay
   * the queued ones over them, so a client with Nutrition queued was shown next
   * cycle's Fitness, Yoga and Mind Wellness as this cycle's — plans nobody had
   * chosen for cycle N+1. A pillar with nothing queued is NOT ALLOCATED, and
   * every preview says so instead of guessing on the coach's behalf.
   */
  const plans: Record<string, Assignment> = {};
  for (const q of queued) {
    plans[q.pillar] = {
      templateId: q.queuedTemplateId,
      overrides: (q.queuedOverrides as Assignment['overrides'] | null) ?? {},
      time: q.time,
    };
  }
  const ids = [...new Set(queued.map((q) => q.queuedTemplateId!))];
  const rows = await prisma.planTemplate.findMany({
    where: { id: { in: ids } },
    select: { id: true, days: true, level: true },
  });
  const templates: Record<string, CalTemplate> = { ...ctx.templates };
  const levelOf = new Map<string, number>();
  for (const t of rows) {
    templates[t.id] = { days: (t.days as CalTemplate['days']) ?? {} };
    levelOf.set(t.id, t.level);
  }
  const levels: Record<string, number> = {};
  for (const q of queued) {
    const lvl = levelOf.get(q.queuedTemplateId!);
    if (lvl != null) levels[q.pillar] = lvl;
  }
  const unallocated: string[] = PILLAR_KEYS.filter((p) => !plans[p]?.templateId);
  return { has: true, plans, templates, levels, unallocated };
}

/** "Sep 11" for a next-cycle day: the engine hands `d - clientDay`, and with clientDay 0 that IS the day number. */
export function nextCycleFmtDate(nextStartMs: number): (dayOffset: number) => string {
  return (dayOffset) =>
    new Date(nextStartMs + (dayOffset - 1) * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The whole cycle as CalDay[], from the ported engine. */
export function buildCalendar(c: CalClient, ctx: CalendarCtx): CalDay[] {
  return calendarFor({
    cycle: c.cycle,
    clientDay: c.cycleDay,
    shape: ctx.shape,
    plans: ctx.plans,
    templates: ctx.templates,
    bookingsByDay: ctx.bookingsByDay,
    sessionLog: ctx.sessionLog,
    staffFor: ctx.staffFor,
    slotWord: (p) => `${pillarName(p)} session`,
    fmtDate: ctx.fmtDate,
  });
}
