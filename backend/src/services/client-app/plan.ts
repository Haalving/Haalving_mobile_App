import {
  dailyTargets,
  assignment,
  describeSlot,
  slotsFor,
  type CalSlot,
  levelup,
  pillarName,
  PILLAR_KEYS,
  SESSION_PILLARS,
  type CalDay,
  type LevelupClient,
  type LevelupRefs,
} from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/apiResponse.js';
import { calendarDay, todayISO } from '../../utils/dates.js';
import * as config from '../config.service.js';
import { buildCalendar, buildCalendarContext } from './calendar-context.js';
import { plateLibrary, pod } from './index.js';

/**
 * THE PLAN HUB — the client's cycle, drawn from real data through the pure engines
 * ported to `@haalving/shared`.
 *
 * Nothing here derives the plan by hand: the calendar comes from `calendarFor`, the
 * level-up progress from `levelup`, the daily strip from `dailyTargets`, and the
 * goal ledger straight off the client's row. This service is only the ADAPTER —
 * it loads the shape, the assignments, the templates, the bookings and the criteria
 * and hands them to the engines, then shapes the result to what the app reads.
 */

/* the level-up card's one-line bar per pillar — the demo's own, hardcoded
   (client-plan.js:701), because it states the SOP, not a computed number */
const LEVELUP_BARS: Record<string, string> = {
  fitness: 'min 4 of 5 sessions · 75% of level goals',
  culture: '5 gates · min 25 of 33 photos · 80% on plan',
  yoga: '3 of 3 sessions · 75% of level goals',
  wellness: 'mind session · sleep 7–8 h · screen cap',
};

/* the plan tiles — pillar key to the word the hub prints. `culture` reads "Diet"
   here (not its "Nutrition" display name), matching the demo's plan tiles. */
const TILE_WORDS: Record<string, string> = {
  culture: 'Diet',
  fitness: 'Fitness',
  yoga: 'Yoga',
  wellness: 'Mind Wellness',
};
const TILE_ORDER = ['culture', 'fitness', 'yoga', 'wellness'] as const;

/** calendarFor's item status -> the hub's mark state, verbatim from `ringCls`. */
const ring = (status: string): 'ok' | 'miss' | 'up' =>
  status === 'done' ? 'ok' : status === 'missed' ? 'miss' : 'up';

type PlanClient = {
  id: string;
  cycle: number;
  cycleDay: number;
  levels: unknown;
  goal: string | null;
  track: string | null;
  observation: boolean;
  trackers: unknown;
  goalLedger: unknown;
  culturePhotos: unknown;
  compliance: number | null;
  sessions: unknown;
  shapeVersion: number | null;
};

async function loadClient(userId: string): Promise<PlanClient> {
  const c = await prisma.client.findFirst({
    where: { userId },
    select: {
      id: true,
      cycle: true,
      cycleDay: true,
      levels: true,
      goal: true,
      track: true,
      observation: true,
      trackers: true,
      goalLedger: true,
      culturePhotos: true,
      compliance: true,
      sessions: true,
      shapeVersion: true,
    },
  });
  if (!c) throw ApiError.notFound('No client record for this account.');
  return c as PlanClient;
}

/**
 * The calendar context, cover-aware. `buildCalendarContext` is shared with Today so
 * the two surfaces cannot draw the cycle apart; it takes the pod seats as an
 * argument rather than importing `pod`, which keeps the module graph acyclic.
 */
async function planContext(c: PlanClient) {
  const seats = await pod(c.id);
  return buildCalendarContext(c, seats);
}

/** The level-up refs, from config.getReference() — the criteria and programme. */
async function levelupRefs(shape: { reviewDay: number }): Promise<LevelupRefs> {
  const [cultureCriteria, bodyCriteria, program] = await Promise.all([
    config.getReference<LevelupRefs['cultureCriteria']>('cultureCriteria'),
    config.getReference<LevelupRefs['bodyCriteria']>('bodyCriteria'),
    config.getReference<{ wellness: LevelupRefs['wellness'] }>('program'),
  ]);
  return { cultureCriteria, bodyCriteria, wellness: program.wellness, reviewWord: `Day-${shape.reviewDay}` };
}

const levelClient = (c: PlanClient): LevelupClient => ({
  observation: c.observation,
  levels: c.levels as Record<string, number>,
  track: c.track,
  sessions: c.sessions as LevelupClient['sessions'],
  culturePhotos: c.culturePhotos as LevelupClient['culturePhotos'],
  compliance: c.compliance,
  sleep: (c.trackers as { sleep?: string } | null)?.sleep ?? null,
});

/** The hub's per-day marks: one per session pillar with a slot, plus the plate. */
function marksFor(day: CalDay, clientDay: number): Array<{ pillar: string; status: 'ok' | 'miss' | 'up' }> {
  const marks: Array<{ pillar: string; status: 'ok' | 'miss' | 'up' }> = [];
  const seen = new Set<string>();
  for (const it of day.items) {
    if (seen.has(it.pillar)) continue;
    seen.add(it.pillar);
    marks.push({ pillar: it.pillar, status: ring(it.status) });
  }
  if (day.meals.length) {
    const s = day.day < clientDay ? 'done' : day.day === clientDay ? 'today' : 'planned';
    marks.push({ pillar: 'culture', status: ring(s) });
  }
  return marks;
}

/** `GET /client/plan` — the hub. */
export async function plan(userId: string) {
  const c = await loadClient(userId);
  const ctx = await planContext(c);
  const cal = buildCalendar(c, ctx);
  const refs = await levelupRefs(ctx.shape);

  /*
   * THE MOVES FOR EVERY SESSION ON THE CYCLE, resolved in one pass.
   *
   * Slots are gathered for all three session pillars across all days, the
   * catalogue is read ONCE for the lot, and each slot is then described with the
   * same `describeSlot` the plate uses — so a move and a dish are named by the
   * same code and cannot drift apart.
   */
  const SESSION_PILLARS_LOCAL = ['fitness', 'yoga', 'wellness'] as const;
  const slotIndex = new Map<string, CalSlot[]>();
  for (const d of cal) {
    for (const pillar of SESSION_PILLARS_LOCAL) {
      const slots = slotsFor(assignment(ctx.plans, pillar), ctx.templates, d.day);
      if (slots.length) slotIndex.set(`${d.day}:${pillar}`, slots);
    }
  }
  const moveLibrary = await plateLibrary([...slotIndex.values()].flat());
  const movesByDayPillar = new Map<string, ReturnType<typeof describeSlot>[]>();
  for (const [key, slots] of slotIndex) {
    movesByDayPillar.set(
      key,
      /* WITH detail: a session card opens onto how the move is done, so unlike the
         fortnight grid this one is actually read */
      slots.map((sl: CalSlot, i: number) => describeSlot(sl, moveLibrary, `Move ${i + 1}`, { detail: true })),
    );
  }

  /* every coach named on the cycle, resolved once rather than per day */
  const staffIds = [...new Set(cal.flatMap((d) => d.items.map((i) => i.staffId).filter((v): v is string => !!v)))];
  const staffName = new Map(
    staffIds.length
      ? (await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })).map(
          (u) => [u.id, u.name] as const,
        )
      : [],
  );

  /* the real calendar date of cycle-day 1, so every day can carry its own ISO —
     `date` is a label ("Sep 10") and cannot be handed to an API */
  const dayOneMs = calendarDay(todayISO()).getTime() - (c.cycleDay - 1) * 86_400_000;

  const calendarOut = cal.map((d) => ({
    day: d.day,
    date: d.date,
    /*
     * THE DAY AS A DATE, not as a label.
     *
     * `GET /client/today?day=<iso>` already returns the whole day — the prescribed
     * plate, each meal's calories and protein, and the targets line. The plan
     * screen could not ask for it because it only held "Sep 10". This is what lets
     * tapping Nutrition on any day open that day's actual food.
     */
    iso: new Date(dayOneMs + (d.day - 1) * 86_400_000).toISOString().slice(0, 10),
    rest: d.rest || undefined,
    review: d.review || undefined,
    meeting: d.meeting || undefined,
    today: d.today || undefined,
    past: d.day < c.cycleDay || undefined,
    flag: d.rest ? 'Rest' : d.review ? 'Review' : d.meeting ? 'Meeting' : undefined,
    marks: marksFor(d, c.cycleDay),
    /*
     * THE DAY'S OWN SESSIONS, so tapping a day can show what is in it.
     *
     * `marks` is a summary — one ring per pillar — and it is all the grid needs.
     * The day sheet needs the sessions themselves: what the session is called,
     * when it runs, who is taking it and where it stands. Sent with the calendar
     * rather than fetched per day, because a fourteen-day cycle is fourteen small
     * arrays and a round trip per tap is a round trip a client waits for.
     */
    items: d.items.map((it) => ({
      pillar: it.pillar,
      label: it.label,
      time: it.time,
      /*
       * THE TASK BEHIND THE SESSION, so the client can mark it done.
       *
       * A completion is a `TaskDone` row — the same record the console's work list
       * writes and the same one this calendar reads back as `status: 'done'`. Sending
       * the id is what lets the app close the loop instead of keeping a private flag
       * the team never sees. Null for a session with no booking behind it, and the
       * app offers no button in that case.
       */
      taskId: ctx.bookingDetail.get(`${d.day}:${it.pillar}`)?.id ?? null,
      /*
       * WHAT THE SESSION ACTUALLY IS — the moves the template prescribes.
       *
       * The engine only ever asked `slotsFor` for the CULTURE pillar, so the plate
       * was described in full while a fitness or yoga session was a title and a
       * time and nothing else. `slotsFor` is pillar-agnostic and the catalogue
       * already carries each move's dose, picture and instructions, so this is the
       * same pipeline the plate uses, pointed at the other three pillars.
       */
      moves: (movesByDayPillar.get(`${d.day}:${it.pillar}`) ?? []),
      /* the name, not the id — the app should not have to hold a staff directory
         to print "with Vikram S." */
      staff: it.staffId ? (staffName.get(it.staffId) ?? null) : null,
      status: it.status,
    })),
    /* the plate runs every day, rest days included — the demo treats it as the
       day's standing task rather than as a session */
    plate: d.meals.length > 0 || undefined,
  }));

  const ledgerRows = ((c.goalLedger as Array<{ level: number; target: string; result?: string; state: string }>) ?? []).map(
    (r) => ({
      level: `L${r.level}`,
      target: r.target,
      result: r.result,
      state: r.state as 'ok' | 'miss' | 'cur' | 'todo',
      vsOk: r.result ? r.state === 'ok' : undefined,
    }),
  );

  const lc = levelClient(c);
  const levelupRows = PILLAR_KEYS.map((pillar) => {
    const lu = levelup(pillar, lc, refs);
    if (!lu) return null;
    const next = lu.level >= 7 ? 'L7 · hold it' : `to L${lu.level + 1}`;
    return { key: pillar, title: `${pillarName(pillar)} · ${next}`, bar: LEVELUP_BARS[pillar] ?? '', ticked: lu.ticked, total: lu.total };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  return {
    cycle: c.cycle,
    day: c.cycleDay,
    sub: `Cycle ${c.cycle} · day ${c.cycleDay} of ${ctx.shape.cycleDays}`,
    goal: c.goal ?? '',
    levels: c.levels,
    calendar: calendarOut,
    tiles: TILE_ORDER.map((key) => ({ key, word: TILE_WORDS[key] ?? key })),
    daily: dailyTargets(c.trackers as Parameters<typeof dailyTargets>[0]),
    ledger: ledgerRows,
    levelup: levelupRows,
  };
}

/**
 * `POST /client/plan/sessions/:taskId/done` — the client marks a session done.
 *
 * IT WRITES THE SAME ROW THE CONSOLE WRITES. A completion is a `TaskDone`, which
 * is what the team's work list ticks, what the calendar reads back as "done", and
 * what the level-up engine counts. A client-only flag would have been easier and
 * would have meant the client's own progress screen and their coach's board
 * telling two different stories about the same session.
 *
 * ONLY THEIR OWN, and only a session that has actually come round. The task must
 * name this client, and a day in the future cannot be completed — a plan you can
 * tick a week ahead measures nothing.
 */
export async function markSessionDone(userId: string, day: number, pillar: string) {
  const c = await loadClient(userId);

  if (!(PILLAR_KEYS as readonly string[]).includes(pillar)) {
    throw ApiError.notFound('No such pillar.');
  }
  /* a session is done on ITS day; a plan you can tick a week ahead measures
     nothing, so today is the latest day that can have happened */
  if (day > c.cycleDay) throw ApiError.badRequest('That session has not come round yet.');
  if (day < 1) throw ApiError.badRequest('That day is not in this cycle.');

  await prisma.clientSessionDone.upsert({
    where: { clientId_cycle_day_pillar: { clientId: c.id, cycle: c.cycle, day, pillar } },
    create: { clientId: c.id, cycle: c.cycle, day, pillar, status: 'done', byId: userId },
    update: { status: 'done', byId: userId },
  });

  /*
   * AND THE BOOKED TASK, WHEN THERE IS ONE.
   *
   * Some sessions are real `Task` bookings and the console's work list ticks those
   * with a `TaskDone`. Writing both keeps the two boards from disagreeing: without
   * it a coach would still see the session open on their queue after the client
   * had marked it done in the app.
   */
  const ctx = await planContext(c);
  const taskId = ctx.bookingDetail.get(`${day}:${pillar}`)?.id;
  if (taskId) {
    const t = await prisma.task.findFirst({ where: { id: taskId }, select: { id: true, date: true } });
    if (t?.date) {
      await prisma.taskDone.upsert({
        where: { taskId_date: { taskId: t.id, date: t.date } },
        create: { taskId: t.id, date: t.date, byId: userId },
        update: {},
      });
    }
  }

  return { done: true, day, pillar };
}

/** `GET /client/plan/:pillar` — one pillar's full level-up detail (rows, goals, note). */
export async function planDetail(userId: string, pillar: string) {
  if (!(PILLAR_KEYS as readonly string[]).includes(pillar)) {
    throw ApiError.notFound('No such pillar.');
  }
  const c = await loadClient(userId);
  const refs = await levelupRefs(await config.getShapeFor(c));
  const lu = levelup(pillar as (typeof PILLAR_KEYS)[number], levelClient(c), refs);
  if (!lu) throw ApiError.notFound('Nothing to show for this pillar yet.');
  return { key: pillar, title: pillarName(pillar), bar: LEVELUP_BARS[pillar] ?? '', ...lu };
}

/** `GET /client/plan-full` — the whole calendar with its per-day session items. */
export async function planFull(userId: string) {
  const c = await loadClient(userId);
  const ctx = await planContext(c);
  const cal = buildCalendar(c, ctx);

  /*
   * THE WHOLE CYCLE'S FOODS, IN ONE READ.
   *
   * Every day's plate names catalogue items, and resolving them day by day would
   * be fourteen queries for one screen. The library is gathered across the cycle
   * once and every day describes itself against it.
   */
  const library = await plateLibrary(cal.flatMap((d) => d.meals));

  return {
    cycle: c.cycle,
    day: c.cycleDay,
    days: cal.map((d) => ({
      day: d.day,
      date: d.date,
      rest: d.rest || undefined,
      review: d.review || undefined,
      meeting: d.meeting || undefined,
      today: d.today || undefined,
      items: d.items.filter((it) => SESSION_PILLARS.includes(it.pillar as (typeof SESSION_PILLARS)[number]) || it.unprescribed),
      /*
       * DESCRIBED, not raw. This used to hand back the template's slots exactly as
       * stored — labels and `ci-` ids — which no screen can draw: a client reading
       * their fortnight would see "ci-idli" where a dish belongs. `describeSlot`
       * is the same function Today's plate uses, so the day view and the cycle
       * view cannot name one meal two ways.
       */
      meals: d.meals.map((m, i) => describeSlot(m, library, `Meal ${i + 1}`)),
    })),
  };
}
