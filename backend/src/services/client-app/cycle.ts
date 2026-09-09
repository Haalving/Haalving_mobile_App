import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import * as notices from '../notice.service.js';
import { calendarDay, todayISO } from '../../utils/dates.js';

/**
 * WHERE A CLIENT ACTUALLY IS IN THEIR CYCLE — derived from a date, not stored.
 *
 * THE BUG THIS EXISTS TO KILL. The calendar used to derive day one as "today
 * minus (cycleDay - 1)". That pins TODAY to whatever day is stored, so the grid's
 * dates advanced every morning while the plan sat on day 6 for ever — the same
 * diet on the 5th and the 8th. A plan that cannot move is not a plan.
 *
 * SO THE ANCHOR IS A DATE. `cycleStart` is the calendar date day 1 fell on, and
 * the day is counted forward from it. Time passing is then the only thing that
 * moves a client through their plan, which is what a cycle means.
 *
 * ROLLOVER IS ARITHMETIC, NOT A CRON. When the count runs past the last day the
 * cycle advances and the anchor moves on by a whole cycle — repeatedly, so a
 * client who does not open the app for a month lands on the right day of the
 * right cycle rather than on "day 47". Doing it on read means there is no job to
 * fail, and no window where the app and the console disagree.
 *
 * THE STORED COLUMNS ARE A CACHE. `cycle`/`cycleDay` are written back only when
 * the derivation disagrees with them, so the console, the worklist rules and
 * every synchronous reader keep working unchanged.
 */

/** Whole days between two calendar dates, neither of them a wall clock. */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export interface CyclePosition {
  cycle: number;
  cycleDay: number;
  /** the calendar date cycle-day 1 of the CURRENT cycle fell on */
  cycleStart: Date;
  /** true when this read moved the client on — the caller may want to react */
  rolled: boolean;
}

/**
 * Read a client's true position, writing back the cache when it has moved.
 *
 * `cycleDays` is the programme's own length (14 by default); it is passed in
 * rather than read here so this stays a pure-ish function of the row.
 */
/**
 * WHERE A CLIENT IS, WITHOUT TOUCHING THE DATABASE.
 *
 * The roster lists hundreds of clients and cannot afford a write per row, so the
 * arithmetic lives here and `advanceCycle` is the thin wrapper that also refreshes
 * the cache. Both answer the same question the same way — which is the point.
 */
export function cyclePosition(
  row: { cycle: number; cycleDay: number; cycleStart: Date | null },
  cycleDays: number,
  now: Date = calendarDay(todayISO()),
): { cycle: number; cycleDay: number; cycleStart: Date } {
  const len = Math.max(1, cycleDays);

  /* no anchor yet — they are wherever the stored day says, and `advanceCycle`
     will write the anchor down the first time it reads them */
  if (!row.cycleStart) {
    return {
      cycle: row.cycle,
      cycleDay: row.cycleDay,
      cycleStart: new Date(now.getTime() - (row.cycleDay - 1) * 86_400_000),
    };
  }

  let start = calendarDay(row.cycleStart.toISOString().slice(0, 10));
  let cycle = row.cycle;
  let elapsed = daysBetween(start, now);
  if (elapsed < 0) elapsed = 0;
  while (elapsed >= len) {
    elapsed -= len;
    cycle += 1;
    start = new Date(start.getTime() + len * 86_400_000);
  }
  return { cycle, cycleDay: elapsed + 1, cycleStart: start };
}

export async function advanceCycle(
  row: { id: string; cycle: number; cycleDay: number; cycleStart: Date | null },
  cycleDays: number,
  now: Date = calendarDay(todayISO()),
): Promise<CyclePosition> {
  const at = cyclePosition(row, cycleDays, now);
  const rolled = at.cycle !== row.cycle || at.cycleDay !== row.cycleDay;

  /* the cache is refreshed only when it actually disagrees, and the anchor is
     written down the first time we see a row without one */
  if (rolled || !row.cycleStart) {
    await prisma.client.update({
      where: { id: row.id },
      data: { cycle: at.cycle, cycleDay: at.cycleDay, cycleStart: at.cycleStart },
    });
  }

  /* a NEW cycle is what the queue was waiting for */
  if (at.cycle > row.cycle) await promoteQueued(row.id, at.cycle);

  return { ...at, rolled };
}

/**
 * DAY 1 OF A NEW CYCLE: whatever was queued takes over.
 *
 * Runs from `advanceCycle`, so it fires on the first read after the cycle rolls
 * — no job to fail, and the client opening the app on day 1 is what promotes
 * their own plan. `queuedForCycle <= newCycle` rather than `===`, so a client
 * who was away for a month still gets the plan that was waiting.
 *
 * A QUEUED TEMPLATE THAT WAS UNPUBLISHED MEANWHILE IS NOT PROMOTED. The rule at
 * publish time is "a new template has to have cleared the chain"; a queue must
 * not be the way round it. The live plan stays, and the log says why.
 */
export async function promoteQueued(clientId: string, newCycle: number): Promise<number> {
  const rows = await prisma.clientPlan.findMany({
    where: { clientId, queuedTemplateId: { not: null }, queuedForCycle: { lte: newCycle } },
    select: {
      id: true,
      pillar: true,
      queuedTemplateId: true,
      queuedOverrides: true,
      queuedById: true,
      log: true,
      queuedTemplate: { select: { name: true, published: true } },
    },
  });

  const clear = {
    queuedTemplateId: null,
    queuedOverrides: Prisma.JsonNull,
    queuedForCycle: null,
    queuedById: null,
    queuedAt: null,
  };
  const at = new Date().toISOString();
  const log = (l: unknown, act: string, byId: string | null) =>
    [...((l as Array<{ act: string; byId: string | null; at: string }>) ?? []), { act, byId, at }].slice(-30);

  let promoted = 0;
  for (const r of rows) {
    const name = r.queuedTemplate?.name ?? 'the queued template';
    if (!r.queuedTemplate?.published) {
      await prisma.clientPlan.update({
        where: { id: r.id },
        data: { ...clear, log: log(r.log, `Cycle ${newCycle} began — ${name} was unpublished, so it did not take over`, null) },
      });
      continue;
    }
    await prisma.clientPlan.update({
      where: { id: r.id },
      data: {
        templateId: r.queuedTemplateId,
        overrides: (r.queuedOverrides ?? {}) as Prisma.InputJsonValue,
        assignedById: r.queuedById,
        assignedAt: new Date(),
        ...clear,
        log: log(r.log, `Cycle ${newCycle} began — ${name} took over from the queue`, r.queuedById),
      },
    });
    promoted += 1;
  }
  return promoted;
}

/** The last two days of a cycle — when the next plan has to be prepared. */
export function isHandoverDay(cycleDay: number, cycleDays: number): boolean {
  return cycleDay >= Math.max(1, cycleDays) - 1;
}

/**
 * THE NEXT CYCLE'S PLAN HAS TO BE READY BEFORE THE CYCLE ENDS.
 *
 * On the last two days the team is told to prepare it — WHETHER OR NOT the
 * client asks. A plan that only gets written when somebody remembers to ask for
 * one is a plan that sometimes does not exist on day 1, and the client finds out
 * by opening an empty day.
 *
 * IDEMPOTENT BY `sourceRule` + cycle. This runs on every read of a client on
 * days 13 and 14; without the guard a client who opens the app ten times gets
 * their pod ten identical tasks.
 */
export async function raiseHandover(
  client: { id: string; name: string; cycle: number },
  cycleDay: number,
  cycleDays: number,
  ownerId: string | null,
  cycleStart: Date,
): Promise<{ raised: boolean }> {
  if (!isHandoverDay(cycleDay, cycleDays)) return { raised: false };

  /* the cycle is IN the rule key, so next cycle raises its own row and this one
     is never raised twice */
  const rule = `cyclePlan:${client.cycle}`;
  const already = await prisma.task.findFirst({
    where: { clientId: client.id, sourceRule: rule },
    select: { id: true },
  });
  if (already) return { raised: false };

  /*
   * THE TIMELINE IS A REAL DATE, not the word "SLA".
   *
   * The next cycle's day 1 is when the client opens the app and expects a plan,
   * so that is the deadline: the work is late the moment it is not there. Dating
   * the row also puts it on the console's scheduled board rather than leaving it
   * floating in a list with no when.
   */
  const dueDate = new Date(cycleStart.getTime() + cycleDays * 86_400_000);
  const dueISO = dueDate.toISOString().slice(0, 10);
  const daysLeft = Math.max(0, cycleDays - cycleDay + 1);

  await prisma.task.create({
    data: {
      title: `Allocate cycle ${client.cycle + 1} template for ${client.name}`,
      kind: 'INTERNAL',
      /* the enum has TASK/RATING/REVIEW/REPORT; REVIEW means a LEVEL review,
         so this is a plain piece of work rather than a new enum value and the
         migration that would go with it */
      workType: 'TASK',
      clientId: client.id,
      pillar: 'culture',
      ownerId,
      assigneeIds: ownerId ? [ownerId] : [],
      /*
       * THE DEADLINE GOES IN `due`, AND THE ROW STAYS UNDATED.
       *
       * `date` is not "when this is due" — it is the day the row STANDS ON, and
       * the work queue shows only undated work, today's, and future meetings.
       * Dating this 10 September made it invisible until the 10th, which is the
       * exact opposite of a deadline: the team would first see the task on the
       * day the client already needed the plan. Undated, it sits on the list from
       * day 13 onward with the date it is wanted by printed on it.
       */
      due: `by day 1 · ${dueISO}`,
      /* two days out is a warning; the last day is not */
      pill: daysLeft <= 1 ? 'bad' : 'warn',
      sourceRule: rule,
    },
  });

  /*
   * AND THE POD IS TOLD, not merely given a row.
   *
   * A task appears on one person's list. A notice reaches everyone who holds a
   * seat for this client, which is what "the team needs to know" means — the
   * dietitian writes the plate, but the fitness and yoga seats each own their
   * half of the next cycle too.
   */
  const seats = await prisma.podSeat.findMany({
    where: { clientId: client.id },
    select: { staffId: true },
  });
  const toIds = [...new Set(seats.map((s) => s.staffId).filter((v): v is string => !!v))];
  if (toIds.length) {
    await notices.raise({
      toIds,
      kind: 'REMINDER',
      title: `Cycle ${client.cycle + 1} template due`,
      text:
        `${client.name} is on day ${cycleDay} of ${cycleDays}. Their cycle ` +
        `${client.cycle + 1} template needs allocating before ${dueISO}.`,
      clientId: client.id,
      /* WATCH, not HIGH: this is due on a known date and nothing has gone
         wrong yet — a plan not yet written on day 13 is the normal case */
      severity: daysLeft <= 1 ? 'HIGH' : 'WATCH',
      /* one notice per client per cycle, however many times this is read */
      dedupeKey: `cyclePlan:${client.id}:${client.cycle}`,
    });
  }

  return { raised: true };
}
