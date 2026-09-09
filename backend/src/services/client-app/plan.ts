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
import { buildCalendar, buildCalendarContext, buildNextCalendar, nextCycleFmtDate, queuedAssignments } from './calendar-context.js';
import * as circleService from '../circle.service.js';
import * as notices from '../notice.service.js';
import { advanceCycle, raiseHandover } from './cycle.js';
import { levelsForClient } from './levels.js';
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
  cycleStart: Date | null;
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
      cycleStart: true,
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

  /*
   * WHERE THEY ACTUALLY ARE TODAY.
   *
   * The stored `cycleDay` is a cache; time is what moves a client through a
   * cycle. Deriving it here — the one place every plan read passes through —
   * is what stopped the calendar showing day 6 on every date for ever.
   */
  /* the client's OWN shape version — a programme whose length changed must not
     retroactively move everyone already mid-cycle */
  const shape = await config.getShapeFor(c);
  const at = await advanceCycle(c, shape.cycleDays);

  /*
   * DAYS 13 AND 14 RAISE THE NEXT PLAN, unprompted.
   *
   * Fired on READ rather than by a nightly job: there is no cron to fail, and the
   * team is told the first time anybody looks at this client on a handover day.
   * `raiseHandover` is idempotent per cycle, so reading twice raises one task.
   */
  const who = await prisma.client.findUnique({
    where: { id: c.id },
    select: { id: true, name: true, cycle: true },
  });
  if (who) {
    const seat = (await pod(c.id)).find((s) => s.seat === 'dietitian')?.coach ?? null;
    await raiseHandover(
      { ...who, cycle: at.cycle },
      at.cycleDay,
      shape.cycleDays,
      seat?.id ?? null,
      at.cycleStart,
    );
  }

  const levels = await levelsForClient(c);
  return { ...c, cycle: at.cycle, cycleDay: at.cycleDay, levels } as PlanClient;
}

/**
 * `POST /client/plan/next` — the client asks for their next cycle's plan.
 *
 * The team is ALREADY told on days 13 and 14 (`raiseHandover`), so this is not
 * what makes the plan happen — it is the client saying something about it, which
 * is a different fact and worth carrying separately. It lands in the circle so
 * the pod sees it where they already talk, and marks the standing task urgent
 * rather than raising a second one.
 */
export async function askForNextPlan(userId: string, note?: string) {
  const c = await loadClient(userId);
  const full = await prisma.client.findUnique({
    where: { id: c.id },
    select: { id: true, name: true, cycle: true },
  });
  if (!full) throw ApiError.notFound('No client record for this account.');

  await circleService.postMessage(c.id, {
    fromUserId: null,
    fromKind: 'CLIENT',
    kind: 'TEXT',
    text: note?.trim()
      ? `Could we look at my next plan? ${note.trim()}`
      : 'Could we look at my next plan?',
  });

  /* the standing handover row becomes urgent; a second row would just split the
     same piece of work across two lines of somebody's list. The DUE DATE is left
     alone — the client asking does not move when the plan is actually needed. */
  const rule = `cyclePlan:${full.cycle}`;
  const raised = await prisma.task.updateMany({
    where: { clientId: c.id, sourceRule: rule },
    data: { pill: 'bad' },
  });

  /*
   * AND THE POD HEARS THAT THEY ASKED.
   *
   * `reopen` on purpose: the standing "template due" notice may well have been
   * read and dismissed days ago, and the client asking is a NEW event rather than
   * the same condition still standing. Standing it back up unread is what puts it
   * in front of the seat again.
   */
  const seats = await prisma.podSeat.findMany({
    where: { clientId: c.id },
    select: { staffId: true },
  });
  const toIds = [...new Set(seats.map((s) => s.staffId).filter((v): v is string => !!v))];
  if (toIds.length) {
    await notices.raise({
      toIds,
      kind: 'REMINDER',
      title: `${full.name} asked about their next plan`,
      text: note?.trim()
        ? `${full.name} asked about their cycle ${full.cycle + 1} plan: “${note.trim()}”`
        : `${full.name} asked about their cycle ${full.cycle + 1} plan.`,
      clientId: c.id,
      severity: 'HIGH',
      dedupeKey: `cyclePlanAsk:${c.id}:${full.cycle}`,
      reopen: true,
    });
  }

  return { asked: true, cycle: full.cycle, taskFlagged: raised.count > 0 };
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

  /*
   * WHAT HAS ACTUALLY BEEN TICKED, for the whole cycle in one read.
   *
   * Keyed `day:pillar:moveIdx`, with `-1` the session itself — the same shape
   * `markSessionDone` writes, so a row written is a row read back.
   */
  const ticks = new Set(
    (
      await prisma.clientSessionDone.findMany({
        where: { clientId: c.id, cycle: c.cycle, status: 'done' },
        select: { day: true, pillar: true, moveIdx: true },
      })
    ).map((t) => `${t.day}:${t.pillar}:${t.moveIdx}`),
  );
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
  /* DAY ONE IS A STORED DATE, not "today minus the day we think it is" — the
     back-derivation is exactly what froze the plan on one day for ever */
  const dayOneMs = c.cycleStart
    ? calendarDay(c.cycleStart.toISOString().slice(0, 10)).getTime()
    : calendarDay(todayISO()).getTime() - (c.cycleDay - 1) * 86_400_000;

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
      /* the session's own tick — `-1`, as `markSessionDone` writes it */
      done: ticks.has(`${d.day}:${it.pillar}:-1`) || it.status === 'done',
      moves: (movesByDayPillar.get(`${d.day}:${it.pillar}`) ?? []).map((mv, mi) => ({
        ...mv,
        /* the index IS the identity of a move here, so the app sends back the
           same number it drew */
        idx: mi,
        done: ticks.has(`${d.day}:${it.pillar}:${mi}`),
      })),
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
    /* the programme's length, from the DB — so the app's "last two days"
       rule follows configuration rather than a number typed into a screen */
    cycleDays: ctx.shape.cycleDays,
    goal: c.goal ?? '',
    levels: c.levels,
    calendar: calendarOut,
    /*
     * NEXT CYCLE, AS IT WILL BE — present only when something is queued.
     *
     * "I am unable to see the next queued plan": a name and a level is not a
     * plan. This is the queued templates run through the same calendar engine,
     * dated from the day the next cycle begins, so the app can page to it the way
     * the console does. No plate rows and no ticks: it has not started.
     */
    ...(await nextCycleFor(c, ctx, dayOneMs, staffName)),
    tiles: TILE_ORDER.map((key) => ({ key, word: TILE_WORDS[key] ?? key })),
    /*
     * "YOUR PROGRESS THIS CYCLE" — the two figures under every pillar sheet.
     *
     * Nutrition counts plates and how many were on plan; the session pillars
     * count sessions kept and cancelled. Straight off the client row the console
     * already writes, so the app and the console quote one number.
     *
     * A figure nobody has set stays NULL and the app prints an em dash — a zero
     * would read as "you did none", which is a different claim from "not counted
     * yet".
     */
    /*
     * WHAT IS WAITING FOR NEXT CYCLE — the answer to the day-13 question.
     *
     * A client who asks "what happens after day 14" should be shown the plan
     * that is already signed and waiting, not told to wait and see.
     */
    next: (
      await prisma.clientPlan.findMany({
        where: { clientId: c.id, queuedTemplateId: { not: null } },
        select: { pillar: true, queuedForCycle: true, queuedTemplate: { select: { name: true, level: true, track: true } } },
      })
    )
      .filter((r) => (PILLAR_KEYS as readonly string[]).includes(r.pillar) && r.queuedTemplate)
      .map((r) => ({
        pillar: r.pillar,
        name: r.queuedTemplate!.name,
        level: r.queuedTemplate!.level,
        track: r.queuedTemplate!.track,
        forCycle: r.queuedForCycle,
      })),
    progress: Object.fromEntries(
      TILE_ORDER.map((key) => {
        if (key === 'culture') {
          const ph = (c.culturePhotos ?? {}) as { uploaded?: number; of?: number; min?: number };
          return [
            key,
            [
              { k: 'Photos', v: ph.of != null ? `${ph.uploaded ?? 0}/${ph.of}` : '—', sub: `min ${ph.min ?? 25} needed` },
              { k: 'On plan', v: c.compliance == null ? '—' : `${c.compliance}%`, sub: 'meals on plan' },
            ],
          ];
        }
        const sk = key === 'wellness' ? 'mind' : key;
        const ss = ((c.sessions ?? {}) as Record<string, { done?: number; target?: number; cancelled?: number }>)[sk] ?? {};
        return [
          key,
          [
            { k: key === 'wellness' ? 'Mind' : 'Sessions', v: `${ss.done ?? 0}/${ss.target ?? 0}`, sub: 'this cycle' },
            { k: 'Cancelled', v: String(ss.cancelled ?? 0), sub: 'this cycle' },
          ],
        ];
      }),
    ),
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
/**
 * `-1` means the SESSION; `0..n` a single move inside it.
 *
 * A session is several exercises and a client finishes them one at a time, so
 * ticking only the whole thing threw away what they actually did — and the team
 * needs the detail, not just a green session.
 */
/**
 * The day's moves for one pillar — used to NAME what a client just finished.
 *
 * Deliberately the same `slotsFor` + `describeSlot` pair the calendar uses, so
 * the index the app sends means the same row the app drew.
 */
async function movesOn(ctx: Awaited<ReturnType<typeof planContext>>, day: number, pillar: string) {
  const slots = slotsFor(assignment(ctx.plans, pillar), ctx.templates, day);
  /* the catalogue MUST be read, or `describeSlot` has nothing to resolve ids
     against and the move is named "ci-surya or ci-catcow" — which is what the
     coach's card said the first time this shipped */
  const lib = await plateLibrary(slots);
  return slots.map((sl, i) => describeSlot(sl, lib, `Move ${i + 1}`));
}

/**
 * Next cycle's calendar from the queued assignments — `{}` when nothing is queued.
 */
async function nextCycleFor(
  c: PlanClient,
  ctx: Awaited<ReturnType<typeof planContext>>,
  dayOneMs: number,
  staffName: Map<string, string>,
): Promise<{
  nextCalendar?: unknown[];
  nextCycle?: { cycle: number; from: string; levels: Record<string, number>; unallocated: string[] };
}> {
  const q = await queuedAssignments(c, ctx);
  if (!q.has) return {};
  const { plans, templates } = q;

  const len = ctx.shape.cycleDays;
  const nextStartMs = dayOneMs + len * 86_400_000;
  const cal2 = buildNextCalendar(c, ctx, plans, templates, nextCycleFmtDate(nextStartMs));

  /* the moves behind each session, from the queued templates */
  const slotIndex = new Map<string, CalSlot[]>();
  for (const d of cal2) {
    for (const pillar of ['fitness', 'yoga', 'wellness'] as const) {
      const slots = slotsFor(assignment(plans, pillar), templates, d.day);
      if (slots.length) slotIndex.set(`${d.day}:${pillar}`, slots);
    }
  }
  const lib = await plateLibrary([...slotIndex.values()].flat());
  const movesOf = (day: number, pillar: string) =>
    (slotIndex.get(`${day}:${pillar}`) ?? []).map((sl, i) => ({
      ...describeSlot(sl, lib, `Move ${i + 1}`, { detail: true }),
      idx: i,
      done: false,
    }));

  const nextCalendar = cal2.map((d) => ({
    day: d.day,
    date: d.date,
    iso: new Date(nextStartMs + (d.day - 1) * 86_400_000).toISOString().slice(0, 10),
    rest: d.rest || undefined,
    review: d.review || undefined,
    meeting: d.meeting || undefined,
    flag: d.rest ? 'Rest' : d.review ? 'Review' : d.meeting ? 'Meeting' : undefined,
    /* one grey pill per day for the pillars nobody has queued — the grid
       must not read as "same as this cycle" when nothing was chosen */
    marks: [
      ...marksFor(d, 0),
      ...(q.unallocated.length ? [{ pillar: 'unallocated', status: 'up' as const, label: 'Not allocated' }] : []),
    ],
    /*
     * ONE ROW PER PILLAR PER DAY. The engine adds a generic "Mind Wellness
     * session" for a pillar's session day and the template adds its own named
     * slot; on the live calendar the booking reconciliation merges them, but a
     * cycle that has not started has no bookings, so the preview showed both.
     * The named one is the plan; the generic one is dropped when it exists.
     */
    items: d.items
      .filter((it, _i, all) => {
        const generic = it.label === `${pillarName(it.pillar)} session`;
        return !generic || !all.some((o) => o !== it && o.pillar === it.pillar);
      })
      .map((it) => ({
        pillar: it.pillar,
        label: it.label,
        time: it.time,
        taskId: null,
        staff: it.staffId ? (staffName.get(it.staffId) ?? null) : null,
        status: 'planned',
        done: false,
        moves: movesOf(d.day, it.pillar),
      })),
    /* the day endpoint now recognises a next-cycle date and builds the plate
       from the queued Nutrition template — so the sheet may offer it */
    plate: d.meals.length > 0 || undefined,
  }));

  return {
    nextCalendar,
    nextCycle: {
      cycle: c.cycle + 1,
      from: new Date(nextStartMs).toISOString().slice(0, 10),
      /* next cycle's levels are the QUEUED templates' — the plate header
         printed this cycle's L2 over a queued L1 plate */
      levels: q.levels,
      unallocated: q.unallocated,
    },
  };
}

export async function markSessionDone(
  userId: string,
  day: number,
  pillar: string,
  moveIdx: number = -1,
) {
  const c = await loadClient(userId);

  if (!(PILLAR_KEYS as readonly string[]).includes(pillar)) {
    throw ApiError.notFound('No such pillar.');
  }
  /* a session is done on ITS day; a plan you can tick a week ahead measures
     nothing, so today is the latest day that can have happened */
  if (day > c.cycleDay) throw ApiError.badRequest('That session has not come round yet.');
  if (day < 1) throw ApiError.badRequest('That day is not in this cycle.');

  await prisma.clientSessionDone.upsert({
    where: {
      clientId_cycle_day_pillar_moveIdx: { clientId: c.id, cycle: c.cycle, day, pillar, moveIdx },
    },
    create: { clientId: c.id, cycle: c.cycle, day, pillar, moveIdx, status: 'done', byId: userId },
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
  /* one exercise is not the booking; only finishing the SESSION closes the
     coach's task, or a single tick would clear their whole queue row */
  const taskId = moveIdx === -1 ? ctx.bookingDetail.get(`${day}:${pillar}`)?.id : undefined;
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

  /*
   * AND THE TEAM IS TOLD, in the room where they already talk.
   *
   * "The client can admin can know how much work done" was the whole point of
   * this button: a row in a table nobody reads is not visibility. The circle
   * card is what a coach actually sees, and it names the move rather than
   * saying only that something was finished.
   */
  const what =
    moveIdx === -1
      ? `${pillarName(pillar)} session`
      : ((await movesOn(ctx, day, pillar))[moveIdx]?.dish ?? `${pillarName(pillar)} move`);
  await circleService.postMessage(c.id, {
    fromUserId: null,
    fromKind: 'CLIENT',
    kind: 'TEXT',
    text: `Done — ${what}.`,
  });

  return { done: true, day, pillar, moveIdx };
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
