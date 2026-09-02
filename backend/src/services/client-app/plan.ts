import {
  dailyTargets,
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
import * as config from '../config.service.js';
import { buildCalendar, buildCalendarContext } from './calendar-context.js';
import { pod } from './index.js';

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

  const calendarOut = cal.map((d) => ({
    day: d.day,
    date: d.date,
    rest: d.rest || undefined,
    review: d.review || undefined,
    meeting: d.meeting || undefined,
    today: d.today || undefined,
    past: d.day < c.cycleDay || undefined,
    flag: d.rest ? 'Rest' : d.review ? 'Review' : d.meeting ? 'Meeting' : undefined,
    marks: marksFor(d, c.cycleDay),
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
      meals: d.meals,
    })),
  };
}
