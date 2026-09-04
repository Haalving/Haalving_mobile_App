import {
  FLOW,
  PILLAR_KEYS,
  dishLine,
  nutTargetsFor,
  groupsOf,
  optId,
  partOfDay,
  slotDetail,
  slotImage,
  slotSum,
  slotsFor,
  stepIndex,
  streak,
  trackerSignals,
  type CalSlot,
  type DayPart,
  type OptionEntry,
  type PlateItem,
  type SlotDetail,
} from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/apiResponse.js';
import { todayISO } from '../../utils/dates.js';
import * as audit from '../audit.service.js';
import { refreshFor } from '../digest.service.js';
import { activeCovers, resolveSeat } from '../covers.service.js';
import * as circleService from '../circle.service.js';
import * as arrivalCircle from './arrival-circle.js';
import { buildCalendar, buildCalendarContext, hmToMin } from './calendar-context.js';
import {
  clientVisibleMessages,
  isObservation,
  maySeeRating,
  stripAi,
  type ClientFacts,
} from './rules.js';
import { ANNOUNCE_COPY, CONSENT_CATALOG, NOTIF_CATALOG, type NotifKey } from './settings-catalog.js';
import * as storage from '../storage.service.js';

/**
 * The client's own window onto their record.
 *
 * ONE RESOLUTION OF WHO IS ASKING, and it is the token. No endpoint here takes a
 * client id: an id in a URL is a thing the caller chooses, and this surface is
 * reached by people who are not staff. `meFor` turns the session into a client row
 * and every other function takes that row.
 *
 * Every read passes through `./rules`, which is where the five things a client
 * must not see are enforced — once, rather than five times.
 */

const asDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** The client behind this session, or a refusal. */
export async function meFor(userId: string) {
  const client = await prisma.client.findFirst({
    where: { userId },
    select: {
      id: true,
      name: true,
      plan: true,
      humanPillars: true,
      observation: true,
      cycle: true,
      cycleDay: true,
      levels: true,
      status: true,
      shapeVersion: true,
    },
  });
  /*
   * 404 rather than 403. A staff token never reaches here — `clientOnly` refuses
   * it at the door — so the only way to arrive without a client row is a login
   * with no record behind it, which is not a permission problem.
   */
  if (!client) throw ApiError.notFound('No client record for this account.');
  return client;
}

export function facts(c: {
  plan: string;
  humanPillars: string[];
  observation: boolean;
  cycle: number;
  cycleDay: number;
}): ClientFacts {
  return {
    plan: c.plan,
    humanPillars: c.humanPillars,
    observation: c.observation,
    cycle: c.cycle,
    cycleDay: c.cycleDay,
  };
}

/**
 * WHO A CLIENT'S COACHES ACTUALLY ARE TODAY.
 *
 * Cover-aware, through `activeCovers` + `resolveSeat`, and deliberately not
 * `seatHolder`. That one is a synchronous fallback answering the OWNER — right
 * whenever no cover is running, and wrong on exactly the day one is, which is the
 * day a client most needs the name to be correct. If the Dietician is on leave the
 * app must say who is standing in, because that is who will answer.
 */
export async function pod(clientId: string) {
  const [seats, covers] = await Promise.all([
    prisma.podSeat.findMany({
      where: { clientId },
      select: { seat: true, staffId: true },
    }),
    activeCovers(),
  ]);

  const held = seats.map((s) => {
    const { staffId, coveredBy } = resolveSeat(covers, clientId, s.seat as string, s.staffId);
    return { seat: s.seat as string, staffId, coveredBy };
  });

  const ids = [...new Set(held.map((h) => h.staffId).filter((v): v is string => !!v))];
  const people = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(people.map((p) => [p.id, p]));

  return held.map((h) => ({
    seat: h.seat,
    /* the name a client reads is whoever holds the seat TODAY */
    coach: h.staffId ? (byId.get(h.staffId) ?? null) : null,
    /* true while somebody is standing in; the app says so rather than pretending */
    covering: h.coveredBy !== null,
  }));
}

/**
 * WHERE SOMEBODY IS, WHEN THEY ARE NOT A CLIENT YET.
 *
 * Sign-up mints a login and an arrival; the Client record is minted twelve steps
 * later. Between those two moments a person can sign in and has every right to —
 * they made an account — but every `/client/*` route resolves through a client row
 * that does not exist, so the app used to sign somebody up successfully and drop
 * them onto a 404.
 *
 * This is the answer for that window. The arrival is found by PHONE, which is the
 * credential the account and the arrival were both keyed on at sign-up. It is a
 * join on a value rather than a foreign key, and that is worth saying out loud:
 * the day an arrival should be linkable to its account by id, this is the line
 * that becomes a relation.
 */
async function onboardingFor(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } });
  if (!u?.phone) return null;

  const a = await prisma.arrival.findFirst({
    where: { phone: u.phone, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, plan: true, step: true, arrivedAt: true },
  });
  if (!a) return null;

  const i = stepIndex(a.step);
  const def = FLOW[i];
  return {
    name: a.name,
    plan: a.plan,
    onboarding: {
      /* one-based, because the person reads "step 1 of 12", not an array index */
      step: i + 1,
      total: FLOW.length,
      label: def?.label ?? a.step,
      phase: def?.phase ?? '',
      arrivedAt: a.arrivedAt.toISOString(),
    },
  };
}

/** `GET /client/me` — the facts every screen needs before it can draw anything. */
export async function me(userId: string) {
  /*
   * THE ONE ROUTE THAT ANSWERS IN BOTH STATES, deliberately. Everything else on
   * this surface needs a client and says so; the app asks this first and routes
   * on `onboarded`, so it never calls a route that cannot answer it yet.
   */
  const pending = await onboardingFor(userId);
  if (pending) {
    return {
      id: null,
      name: pending.name,
      plan: pending.plan,
      /* no cycle has begun — a 1 here would be a fortnight nobody is on */
      cycle: 0,
      day: 0,
      observation: false,
      /* THE GATE the app reads. Every tab is reachable; what is inside them is
         not, because there is genuinely nothing there yet. */
      onboarded: false as const,
      onboarding: pending.onboarding,
      levels: {},
      pod: [],
      unread: 0,
      streak: undefined,
    };
  }

  const c = await meFor(userId);
  const f = facts(c);

  const seats = await pod(c.id);

  /*
   * THE UNREAD DOT, for real now: visible messages the client has not caught up
   * to. `CircleRead.lastSeq` is where they last read to, and TEAMONLY lines never
   * count because they never reach this surface (rule 2). The receipt is written
   * by `POST /client/circle/read` when the thread is opened.
   */
  const unread = await circleUnread(c.id);

  /*
   * THE STREAK, from the cycle calendar. One flame a day, lit when that day's
   * sessions are all done — the same calendar Today and My Plan draw, run through
   * the ported `streak`. Observation has no sessions to keep, so it carries none;
   * the app hides the card when the run is zero.
   */
  let streakOut: ReturnType<typeof streak> | undefined;
  if (!isObservation(f)) {
    const ctx = await buildCalendarContext(c, seats);
    streakOut = streak(buildCalendar(c, ctx), c.cycleDay);
  }

  return {
    id: c.id,
    name: c.name,
    plan: c.plan,
    /* a promoted client is onboarded by definition — the record only exists on
       the far side of step 12 */
    onboarded: true as const,
    onboarding: undefined,
    cycle: c.cycle,
    day: c.cycleDay,
    /* the app routes on this: observation gets a different Today and Journey */
    observation: isObservation(f),
    levels: c.levels,
    pod: seats,
    unread,
    streak: streakOut,
  };
}

/**
 * A plate the client actually photographed, as the client may see it.
 *
 * Stated rather than inferred because `stripAi` answers `Record<string, unknown>`
 * — correct for a function whose whole job is removing keys, and useless to a
 * caller that has to merge these against the prescribed slots. The fields below
 * are the ones `stripAi` never touches (it removes only the `ai*` half), so
 * naming them changes nothing at runtime and gives `buildPlate` something to
 * read.
 */
interface LoggedMeal {
  id: string;
  slot: string;
  capturedAt: string;
  photo: string | null;
  dishes: unknown;
  fullness: unknown;
  stars: number | null;
  note: string | null;
}

/** The plate and its counter. Rules 1 and 3 both land here. */
async function mealsFor(clientId: string, date: Date, f: ClientFacts): Promise<LoggedMeal[]> {
  const next = new Date(date.getTime() + 86_400_000);
  const rows = await prisma.meal.findMany({
    where: { clientId, capturedAt: { gte: date, lt: next } },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      slot: true,
      capturedAt: true,
      photo: true,
      dishes: true,
      fullness: true,
      finalStars: true,
      finalNote: true,
      aiStars: true,
      aiConf: true,
      aiDetected: true,
      aiNote: true,
    },
  });

  /* Promise.all, not a bare map: each photo may need a signed URL, and signing is
     async. Signed in parallel — a day is at most a handful of plates. */
  return Promise.all(
    rows.map(async (m) => {
    const shaped = stripAi({ ...m }, f, 'culture') as Record<string, unknown>;
    delete shaped.finalStars;
    delete shaped.finalNote;
    return {
      ...shaped,
      /* restated after the spread so the shape is READABLE, not merely correct —
         `stripAi` removes only the `ai*` half, so every one of these is the same
         value it already carried */
      id: m.id,
      slot: m.slot,
      /* an R2 key becomes a signed URL; a seeded `img/...` path is left alone —
         see `storage.displayUrl`. The phone can render either without knowing
         which it was handed. */
      photo: await storage.displayUrl(m.photo),
      dishes: m.dishes,
      fullness: m.fullness,
      capturedAt: m.capturedAt.toISOString(),
      /*
       * Rule 3. In observation nobody has rated anything, and printing a null
       * where a rating goes reads as a coach who has not got round to it rather
       * than a baseline week where rating is not the point.
       */
      stars: maySeeRating(f) ? m.finalStars : null,
      note: maySeeRating(f) ? m.finalNote : null,
    };
    }),
  );
}

/**
 * One row of the plate — a prescribed slot, a logged plate, or a slot that is
 * both. `id` is null exactly when nothing has been photographed into the slot,
 * which is also the only thing that makes a row un-openable on the phone.
 */
interface PlateRow extends Omit<LoggedMeal, 'id' | 'capturedAt'> {
  id: string | null;
  capturedAt: string | null;
  /** the template's suggested clock for the slot, "8:00" — null once logged */
  time: string | null;
  /** false for a plate the client logged that the template never asked for */
  planned: boolean;
  /** the three pages behind a tap — how it is made, what is in it, what instead */
  detail?: SlotDetail;
  /**
   * WHAT TO EAT, in the plan's own words: "Idli ×2 + Coconut chutney or Plain
   * dosa + Coconut chutney". Empty on a plate the plan never asked for — there
   * is no prescription behind it to quote.
   */
  dish: string;
  /** the FIRST option's reading; alternatives replace it, they never add to it */
  kcal: number | null;
  protein: number | null;
  /** the lead item's picture, as the catalogue stores it */
  image: string | null;
  /** Morning · Afternoon · Evening — the band this meal sits under */
  part: DayPart;
}

/** The day's targets and the plan they came from — the line above the plate. */
interface PlateHead {
  /** "Everyday plate — L1 Sedentary" */
  title: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

/**
 * THE PLATE IS WHAT THE PLAN PRESCRIBES, not only what has been photographed.
 *
 * This is the half of the plan pipeline that was missing, and the symptom was
 * precise: the console assigns a Nutrition template whose day carries Breakfast,
 * Mid-morning, Lunch and Dinner, the calendar engine computes exactly those into
 * `CalDay.meals` — and `today` threw them away and answered with the Meal rows
 * instead. A client who had not yet photographed anything was told "No plate set
 * for this cycle yet" while a plate sat published against their name. The plan was
 * reaching the server and dying one line short of the phone.
 *
 * THE PRESCRIPTION LEADS AND THE PHOTOGRAPH JOINS IT. A slot is matched to a
 * logged plate by its own name (`Breakfast` to the meal captured as `Breakfast`),
 * so the row reads as a day schedule that fills in as the day is eaten — the
 * demo's reading exactly (client-today.js:604): "a slot reads as logged the moment
 * its photo lands in the meal queue, so nothing is stored twice".
 *
 * A PLATE NOBODY PRESCRIBED STILL BELONGS TO THE DAY. A client may photograph a
 * meal the template never asked for, and dropping it would lose a record they made
 * on purpose — the same reading the calendar takes of an unprescribed booking. It
 * lands after the prescribed rows, flagged `planned: false`.
 *
 * FIRST MATCH WINS, and only once. Two plates captured in one slot must not both
 * claim it, or the second would silently overwrite the first's rating on screen;
 * the loser falls through to the unprescribed tail, where it is still visible.
 */
function buildPlate(
  prescribed: CalSlot[],
  logged: LoggedMeal[],
  byId: Map<string, PlateItem>,
): PlateRow[] {
  const bySlot = new Map<string, LoggedMeal>();
  for (const m of logged) if (!bySlot.has(m.slot)) bySlot.set(m.slot, m);

  /** the ids that a prescribed slot has taken, so the tail cannot repeat them */
  const taken = new Set<string>();
  const rows: PlateRow[] = [];

  for (const [i, s] of prescribed.entries()) {
    /* a template slot without a label is still a meal — name it by its place
       rather than dropping a row the plan does prescribe */
    const slot = s.label?.trim() || `Meal ${i + 1}`;
    const hit = bySlot.get(slot);
    if (hit) taken.add(hit.id);

    /*
     * THE PRESCRIPTION IS READ THROUGH `@haalving/shared`, not here. The console
     * prints "225 kcal · 5.5 g" against this same slot on the client's Plan tab,
     * and two surfaces quoting one plate must not each do their own arithmetic —
     * so the dish line, the reading and the picture all come from `plate.ts`,
     * which is where the console's own math will point when it converges.
     */
    const sum = slotSum(s, byId);
    const dish = dishLine(s, byId);
    /* the plate is a handful of rows and every one is openable, so the detail
       rides along rather than costing a request per tap */
    const detail = slotDetail(s, byId);

    rows.push({
      ...(hit ?? {
        photo: null,
        dishes: [],
        fullness: null,
        stars: null,
        note: null,
      }),
      id: hit?.id ?? null,
      slot,
      capturedAt: hit?.capturedAt ?? null,
      time: s.time ?? null,
      planned: true,
      dish,
      /* a slot whose foods carry no nutrients reads as UNKNOWN, not as zero — a
         zero would print "0 kcal" against a real meal */
      kcal: sum.kcal || null,
      protein: sum.protein || null,
      image: slotImage(s, byId),
      part: partOfDay(s.time),
      detail,
    });
  }

  for (const m of logged) {
    if (taken.has(m.id)) continue;
    rows.push({
      ...m,
      time: null,
      planned: false,
      /* nothing prescribed it, so there is no dish line to quote and no reading
         to take — what the client photographed is the only record of it */
      dish: '',
      kcal: null,
      protein: null,
      image: null,
      part: 'Morning',
    });
  }

  return rows;
}

/**
 * Every catalogue item the day's slots name, in one read.
 *
 * Ids are gathered across ALL option groups, not just the first: the reading
 * only counts group one, but the dish line names every alternative, and a
 * missing name would print a raw `ci-` id at the client.
 */
export async function plateLibrary(slots: CalSlot[]): Promise<Map<string, PlateItem>> {
  const ids = new Set<string>();
  for (const s of slots) {
    for (const group of groupsOf(s)) {
      for (const e of group) {
        const id = optId(e);
        if (id) ids.add(id);
      }
    }
  }
  if (!ids.size) return new Map();

  const rows = await prisma.catalogItem.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, body: true },
  });
  return new Map(
    rows.map((r) => {
      const body = (r.body ?? {}) as {
        nutrients?: PlateItem['nutrients'];
        media?: PlateItem['media'];
        dose?: PlateItem['dose'];
        portion?: PlateItem['portion'];
        instructions?: string;
      };
      return [
        r.id,
        {
          id: r.id,
          name: r.name,
          nutrients: body.nutrients,
          media: body.media,
          dose: body.dose,
          /* the two the opened sheet reads — the portion under each food, and the
             method on its first page. They were dropped here, so the sheet had a
             dish with no recipe and foods with no amounts. */
          portion: body.portion,
          instructions: body.instructions,
        },
      ];
    }),
  );
}

/**
 * `GET /client/today?day=` — one day of the client's own week.
 *
 * OBSERVATION IS A DIFFERENT ANSWER, not a filtered one. Days 1 to 5 have no
 * booked sessions because none exist yet, and handing back an empty list would
 * read as a coach who forgot rather than a baseline week that has not started.
 */
export async function today(userId: string, dayIso?: string) {
  const c = await meFor(userId);
  const f = facts(c);
  const date = asDate(dayIso ?? todayISO());
  const iso = date.toISOString().slice(0, 10);

  /*
   * THE ARRIVAL IS THIS MORNING'S, not a browsed day's. It is keyed by cycle-day
   * (the demo's moodLog) and read only when the client is looking at today —
   * browsing back to Tuesday should not show Tuesday a mood answered on Friday,
   * and the demo hides the arrival strip the same way it hides the film when
   * `browsedAway`. A day with no answer is `{ mood: null }`, which is the
   * unanswered state the band already draws.
   */
  const isToday = iso === todayISO();
  const moodRow = isToday
    ? await prisma.clientMood.findFirst({
        where: { clientId: c.id, cycle: c.cycle, day: c.cycleDay },
        select: { mood: true },
      })
    : null;
  const arrival = { mood: moodRow?.mood ?? null };

  if (isObservation(f)) {
    return {
      observation: true as const,
      date: iso,
      cycle: c.cycle,
      day: c.cycleDay,
      sessions: [] as unknown[],
      /*
       * Observation prescribes nothing, so every row here is a plate the client
       * photographed of their own accord. It still goes through `buildPlate` so
       * the phone reads ONE shape on both branches — a screen that had to know
       * which kind of day it was looking at before it could read a meal would
       * grow the observation check the five rules exist to keep off it.
       */
      meals: buildPlate([], await mealsFor(c.id, date, f), new Map()),
      /*
       * NO TARGETS IN OBSERVATION, and that is `nutTargetsFor`'s own answer for a
       * client with nothing assigned. Deriving 1800 kcal here would print a goal
       * nobody set over a plate that does not exist — the baseline week is for
       * learning what their normal is, not for measuring it against a number.
       */
      plate: null,
      arrival,
      /* observation prescribes nothing, the morning film included */
      film: null,
    };
  }

  /*
   * THE DAY'S SESSIONS COME FROM THE CALENDAR, not from Task rows alone.
   *
   * The demo builds Today from `HV.calendarFor` (client-today.js:475) — the
   * template PRESCRIBES what each cycle-day holds, and a coach's booking
   * reconciles WHEN and WITH WHOM on top. Reading only the Task rows showed
   * booked sessions but never a prescribed-yet-unbooked one, so a day the plan
   * calls for a class the coach has not scheduled read as empty. `calendarFor` is
   * the same engine My Plan draws, shared through `calendar-context` so the two
   * cannot drift.
   */
  const seats = await pod(c.id);
  const ctx = await buildCalendarContext(c, seats);
  const cal = buildCalendar(c, ctx);

  /* which cycle-day is on screen: the client's own day, shifted by how far the
     asked date is from today, and never off the ends of the cycle */
  const offset = Math.round((date.getTime() - asDate(todayISO()).getTime()) / 86_400_000);
  let viewDay = c.cycleDay + offset;
  if (viewDay < 1 || viewDay > ctx.shape.cycleDays) viewDay = c.cycleDay;
  const items = cal[viewDay - 1]?.items ?? [];

  /*
   * THE PRESCRIBED PLATE, AND THE FOODS IT NAMES.
   *
   * `cal[...].meals` is the day's Nutrition slots straight from the assigned
   * template; the library resolves every catalogue id they mention so the rows
   * can carry dish names and a reading rather than raw `ci-` ids.
   */
  const prescribed = cal[viewDay - 1]?.meals ?? [];
  const library = await plateLibrary(prescribed);

  /*
   * THE TARGETS LINE — "Everyday plate — L1 Sedentary · 1700 kcal · 75 g protein
   * a day", the same sentence the console prints above this very plate.
   *
   * Read off the LIVE assignment, never a staged ticket: what a coach is still
   * editing is a coach thinking, and the client is served only what has been
   * signed. `nutTargetsFor` answers null when nothing is assigned, and the app
   * then prints no targets rather than a derived number nobody set.
   */
  const cultureRow = await prisma.clientPlan.findUnique({
    where: { clientId_pillar: { clientId: c.id, pillar: 'culture' } },
    select: {
      templateId: true,
      targets: true,
      template: { select: { name: true, days: true } },
    },
  });
  const targets = nutTargetsFor(
    { templateId: cultureRow?.templateId ?? null, targets: (cultureRow?.targets ?? null) as never },
    (cultureRow?.template?.days ?? null) as never,
    viewDay,
    ctx.shape.cycleDays,
  );
  const head: PlateHead | null = targets
    ? {
        title: cultureRow?.template?.name ?? 'Your plate',
        kcal: targets.kcal,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
        fibre: targets.fibre,
      }
    : null;

  /* every staff id the day's items name, resolved to a name in one query — the
     seat holder is cover-aware, but a booking may name someone off the pod. */
  const nameById = new Map<string, string>();
  for (const s of seats) if (s.coach) nameById.set(s.coach.id, s.coach.name);
  const extra = [...new Set(items.map((it) => it.staffId).filter((v): v is string => !!v && !nameById.has(v)))];
  if (extra.length) {
    const people = await prisma.user.findMany({ where: { id: { in: extra } }, select: { id: true, name: true } });
    for (const p of people) nameById.set(p.id, p.name);
  }

  return {
    observation: false as const,
    date: iso,
    cycle: c.cycle,
    day: viewDay,
    sessions: items.map((it, i) => {
      /* the real Task behind a booking carries the join door and the duration;
         a prescribed-but-unbooked slot has neither, and cannot be joined. */
      const det = ctx.bookingDetail.get(`${viewDay}:${it.pillar}`);
      return {
        id: det?.id ?? `plan-${it.pillar}-${viewDay}-${i}`,
        title: it.label,
        pillar: it.pillar,
        startMin: det?.startMin ?? hmToMin(it.time),
        durMin: det?.durMin ?? null,
        /*
         * The join door. Whether there IS a room is served; the room is not built
         * here by instruction, and the link itself only leaves the server when the
         * client actually opens it — see `joinSession`.
         */
        joinable: !!det?.link,
        done: it.status === 'done',
        coach: it.staffId ? (nameById.get(it.staffId) ?? null) : null,
      };
    }),
    /* the day's prescribed plate, filled in by whatever has been photographed —
       the same `cal` the sessions above came from, so the plan cannot describe
       the day two different ways */
    meals: buildPlate(prescribed, await mealsFor(c.id, date, f), library),
    /* the targets line the plate sits under — the same reading the console shows
       on the client's Plan tab, resolved by the same shared function */
    plate: head,
    arrival,
    film: await filmFor(ctx, viewDay),
  };
}

/**
 * THE MORNING FILM — the demo's `HV.motivationFor` (core.js:3173) without its
 * library walk.
 *
 * The live Motivation plan prescribes one film per cycle-day the same way the
 * Nutrition plan prescribes the plate: the day's slot, Option A, first entry, is
 * the film. The demo then walked the library so its nine personas always had a
 * film even with nothing assigned; that fallback is left out here on purpose —
 * a film nobody prescribed is a film no coach stands behind, and the mark on
 * Today reads "nothing assigned" as inert rather than inventing a clip.
 *
 * `url` is the item's video, or null when the library holds no link yet: the
 * mark is drawn either way and only opens when there is somewhere to go.
 */
async function filmFor(
  ctx: Awaited<ReturnType<typeof buildCalendarContext>>,
  day: number,
): Promise<{ id: string; name: string; url: string | null } | null> {
  const a = ctx.plans.motivation ?? null;
  const slot = slotsFor(a, ctx.templates, day)[0];
  const first = (slot?.options as OptionEntry[][] | undefined)?.[0]?.[0];
  const id = optId(first);
  if (!id) return null;
  const item = await prisma.catalogItem.findFirst({
    where: { id, pillar: 'motivation' },
    select: { id: true, name: true, body: true },
  });
  /* a film deleted from the library but still named in the template is nothing
     to open — null, rather than a name with no clip behind it */
  if (!item) return null;
  /* the two media shapes the demo's `itemMedia` reads: the authored `video`, or
     the seeded `{ kind: 'youtube', ref }` */
  const media = ((item.body as { media?: { video?: string; kind?: string; ref?: string } } | null)?.media) ?? {};
  const url = filmUrl(media.video || (media.kind === 'youtube' ? media.ref : '') || '');
  return { id: item.id, name: item.name, url };
}

/**
 * Something the phone can actually open, or null.
 *
 * The console's Library accepts what the demo's `ytId` accepts — a bare
 * eleven-character id, a watch URL, a youtu.be link, a Shorts link — and a
 * file path such as `media/welcome.mp4` that only the demo's own server could
 * serve. `Linking.openURL` wants a scheme, so a YouTube reference becomes its
 * watch URL, an http(s) address passes through, and anything else is null:
 * the mark then stays inert rather than promising a film that will not open.
 */
function filmUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const yt = /^[\w-]{11}$/.test(s) ? s : /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/.exec(s)?.[1];
  if (yt) return `https://www.youtube.com/watch?v=${yt}`;
  return /^https?:\/\//i.test(s) ? s : null;
}

/**
 * `POST /client/sessions/:id/join` — open the door.
 *
 * Hands back the link the console stored, and records that the client opened it.
 * The session room is out of scope for this port; this is the handle on the one
 * that already exists.
 */
export async function joinSession(userId: string, taskId: string) {
  const c = await meFor(userId);

  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId: c.id },
    select: { id: true, title: true, link: true },
  });
  /*
   * Not 403. A session that is not yours is a session that does not exist, and a
   * 403 would confirm the id names something real — the same reading `/clients`
   * takes, for the same reason.
   */
  if (!task) throw ApiError.notFound('No such session.');
  if (!task.link) throw ApiError.conflict('That session has no room yet.');

  await audit.record({
    actorId: userId,
    action: 'client.session_joined',
    subjectType: 'task',
    subjectId: task.id,
    meta: { clientId: c.id, title: task.title },
  });

  return { id: task.id, link: task.link };
}

/** `GET /client/profile` — the read side. The settings toggles arrive in C4. */
export async function profile(userId: string) {
  const c = await prisma.client.findFirst({
    where: { userId },
    select: {
      id: true,
      name: true,
      code: true,
      designation: true,
      plan: true,
      humanPillars: true,
      observation: true,
      cycle: true,
      cycleDay: true,
      levels: true,
      health: true,
      heightCm: true,
      weightKg: true,
    },
  });
  if (!c) throw ApiError.notFound('No client record for this account.');

  /*
   * THE RECORDS VAULT IS SIGNED SUMMARIES ONLY — rule 5.
   *
   * A pending summary is a document nobody has signed. The console shows it to
   * the doctor who must sign it; a client is never handed a medical reading no
   * human has yet stood behind.
   */
  const records = await prisma.medicalSummary.findMany({
    where: { clientId: c.id, status: 'READY' },
    orderBy: { uploadedOn: 'desc' },
    select: { id: true, title: true, kind: true, uploadedOn: true },
  });

  return {
    id: c.id,
    name: c.name,
    code: c.code,
    designation: c.designation,
    plan: c.plan,
    cycle: c.cycle,
    day: c.cycleDay,
    levels: c.levels,
    /* the four in the product's own order, never an object's key order */
    pillars: PILLAR_KEYS,
    health: c.health,
    heightCm: c.heightCm,
    weightKg: c.weightKg,
    pod: await pod(c.id),
    records,
  };
}

/* ------------------------------------------------------------------- meals */

/**
 * The slots a plate can occupy.
 *
 * The demo's own words, matched by name to the teaching in `MealPlan` — the Meal
 * model says so where it declares the column. A free-text slot would break that
 * match silently: the plate would still render, and the plan it is measured
 * against would quietly stop lining up.
 */
export const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-workout'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** What the client said about the plate. Their reading, never overwritten by a coach's. */
export const FULLNESS = ['Light', 'Just right', 'Stuffed'] as const;
export type Fullness = (typeof FULLNESS)[number];

export type CaptureInput = {
  slot: MealSlot;
  fullness: Fullness;
  dishes: string[];
  photo?: string | null;
};

/**
 * `POST /client/meals` — the plate, as the client saw it.
 *
 * THE CLIENT IS THE AUTHOR OF EXACTLY FOUR THINGS: which slot, how full they
 * felt, what was on the plate, and the photograph. Nothing else on the row is
 * theirs to set. In particular:
 *
 *   - NO RATING. `finalStars` stays null, which is precisely what puts the meal
 *     on the dietitian's queue — `queues.service` tests that column and nothing
 *     else. A client who could write it could rate their own plate.
 *   - NO PRE-SCORE. The AI columns stay null because no AI has looked at this.
 *     The demo fabricates `{stars: 4, conf: 85}` in the browser at capture time,
 *     and that is a demo doing without a server; writing the same numbers here
 *     would hand the dietitian an assessment nobody made.
 *   - NO KCAL OR PROTEIN. They default to zero and the dietitian sets them. A
 *     number the calorie log adds up cannot come from the person being measured.
 *
 * `capturedAt` is server time, not a time the client sends. It starts the SLA
 * clock every lateness figure on the meals board is measured from, so a client
 * choosing it could park their plate at the front of the queue — or, by accident
 * of a wrong phone clock, at the back of it for ever.
 */
/* ---------------------------------------------------------------- records */

/**
 * A report the client uploads from the phone.
 *
 * IT LANDS IN THE SAME TABLE THE DOCTOR ALREADY WATCHES. `MedicalSummary` is what
 * the console's Medical board reads, so a lab sent from a handset appears in the
 * clinician's queue rather than in a second store somebody has to remember to
 * look at — which is the failure mode of every "client uploads" feature that gets
 * its own table.
 *
 * PENDING, never signed. Only a clinician's signature makes a summary a record,
 * and the client cannot supply one; `status` says so and the board files it under
 * work rather than under history.
 *
 * `uploadedOn` is the demo's human label ("Today", "12 Oct") rather than a date
 * this system observed — see the schema. Written here as the client's own day.
 */
export async function addDocument(
  userId: string,
  input: { title: string; kind: string; key: string; fileName: string; mime: string; bytes: number },
) {
  const c = await meFor(userId);

  /* the key must be one WE minted, in the client folder — otherwise a caller
     could attach somebody else's object by guessing at a path */
  if (!input.key.startsWith('documents/')) {
    throw ApiError.badRequest('That file was not uploaded through this app.');
  }

  const row = await prisma.medicalSummary.create({
    data: {
      clientId: c.id,
      title: input.title,
      kind: input.kind,
      uploadedOn: 'Today',
      status: 'PENDING',
      fileKey: input.key,
      fileName: input.fileName,
      fileMime: input.mime,
      fileSize: input.bytes,
    },
    select: { id: true, title: true, kind: true, uploadedOn: true, fileName: true },
  });

  return { ...row, signed: false };
}

/** The client's own Records Vault, newest first, each with a link they can open. */
export async function documents(userId: string) {
  const c = await meFor(userId);
  const rows = await prisma.medicalSummary.findMany({
    where: { clientId: c.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      kind: true,
      uploadedOn: true,
      signedAt: true,
      fileKey: true,
      fileName: true,
      fileSize: true,
    },
  });

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      uploadedOn: r.uploadedOn,
      /* a signature is the doctor's, so the client reads it rather than sets it */
      signed: !!r.signedAt,
      fileName: r.fileName,
      sizeBytes: r.fileSize,
      /* null for the seeded summaries, which are written notes with no file */
      url: await storage.displayUrl(r.fileKey),
    })),
  );
}

export async function captureMeal(userId: string, input: CaptureInput) {
  const c = await meFor(userId);

  if (!input.dishes.length) {
    throw ApiError.badRequest('Keep at least one dish on the plate.');
  }

  const meal = await prisma.meal.create({
    data: {
      clientId: c.id,
      slot: input.slot,
      fullness: input.fullness,
      dishes: input.dishes,
      photo: input.photo ?? null,
      capturedAt: new Date(),
    },
    select: { id: true, slot: true, capturedAt: true },
  });

  await audit.record({
    actorId: userId,
    action: 'meal.captured',
    subjectType: 'meal',
    subjectId: meal.id,
    meta: {
      slot: meal.slot,
      dishes: input.dishes.length,
      photo: !!input.photo,
      /* the plate a client logs during observation is still a record, and it is
         the ONLY record from that week — the trail says which kind it was */
      observation: isObservation(facts(c)),
    },
  });

  /* the plate is the other sign of life the digest can see — rebuild this
     client's line against it rather than leaving 08:00's reading standing */
  refreshFor(c.id);

  return { id: meal.id, slot: meal.slot, capturedAt: meal.capturedAt.toISOString() };
}

/**
 * `GET /client/meals/:id` — one plate, as the client may see it.
 *
 * THE ID IS CHECKED AGAINST THE SESSION, not trusted. It is the only id this
 * surface accepts in a path, and a meal is a photograph of someone's dinner: the
 * answer for a meal that is not theirs is 404, not 403, because a 403 confirms
 * the meal exists.
 */
/** First token of a name — "Sneha M." → "Sneha", the only part the app prints. */
const firstName = (name?: string | null): string => (name ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * "5 h ago", "14 min ago" — the demo's own `HV.ago`, to the minute.
 *
 * The server sends a display string rather than a timestamp because the demo
 * screen shows exactly this and computing it here keeps one clock. `capturedAt`
 * is the SLA instant, so this is minutes since the plate was logged.
 */
const agoOf = (from: Date, now: Date = new Date()): string => {
  const mins = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h ${m ? `${m} m ` : ''}ago`;
};

/** The four-row rubric, from the stored `{label:value}` map to the app's list. */
const rubricRows = (raw: unknown): { label: string; value: string }[] => {
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (r): r is { label: unknown; value: unknown } =>
          !!r && typeof r === 'object' && 'label' in r && 'value' in r,
      )
      .map((r) => ({ label: String(r.label), value: String(r.value) }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([label, value]) => ({
      label,
      value: String(value),
    }));
  }
  return [];
};

export async function mealDetail(userId: string, mealId: string) {
  const c = await meFor(userId);
  const f = facts(c);

  const m = await prisma.meal.findFirst({
    where: { id: mealId, clientId: c.id },
    /*
     * THE AI COLUMNS ARE NOT SELECTED AT ALL — rule 1 by omission, which is
     * stronger than stripping them after: a field never read cannot leak. Only
     * what the client may see is loaded.
     */
    select: {
      id: true,
      slot: true,
      capturedAt: true,
      photo: true,
      dishes: true,
      fullness: true,
      protein: true,
      kcal: true,
      finalStars: true,
      finalById: true,
      finalNote: true,
      finalVoiceSec: true,
      rubric: true,
      finalBy: { select: { name: true } },
    },
  });
  if (!m) throw ApiError.notFound('No such meal.');

  const observation = isObservation(f);
  /* rule 3: an observation client never sees a rating, even one that exists */
  const rated = maySeeRating(f) && m.finalStars !== null;

  const final = rated
    ? {
        stars: m.finalStars as number,
        /* a null rater is the AI (the model's rule: finalStars set, finalById
           null); a human is named by first name only */
        byName: m.finalById ? firstName(m.finalBy?.name) : 'your AI coach',
        isAI: m.finalById === null,
        voiceSec: m.finalVoiceSec ?? 0,
        note: m.finalNote ?? '',
        rubric: rubricRows(m.rubric),
      }
    : null;

  /*
   * THE PENDING LINE names who will rate it — the current Nutrition (culture)
   * seat, cover-aware, so a plate logged while the dietitian is on leave says who
   * is actually standing in. A null coach on that seat is the AI holding it, and
   * an observation plate says nothing here (the screen shows the capture-only
   * notice off `observation`), and a rated one has `final` instead.
   */
  let pendingLine: string | null = null;
  if (!observation && !rated) {
    /* the rater's seat is `dietitian` — a role/seat key, not the meal's `culture`
       pillar; pod() is cover-aware, so a plate logged while the dietitian is on
       leave names whoever is standing in */
    const seats = await pod(c.id);
    const diet = seats.find((s) => s.seat === 'dietitian');
    pendingLine = diet?.coach
      ? `${firstName(diet.coach.name)} sees this exactly as you sent it. A rating usually lands within the hour.`
      : 'Your AI coach sees this instantly.';
  }

  return {
    id: m.id,
    slot: m.slot,
    ago: agoOf(m.capturedAt),
    photo: m.photo,
    dishes: m.dishes,
    fullness: m.fullness,
    protein: m.protein,
    kcal: m.kcal,
    observation,
    pendingLine,
    final,
  };
}

/* ------------------------------------------------------------------ coaches */

/**
 * `GET /client/coaches` — the coach marketplace, per pillar, with the client's own
 * coach marked.
 *
 * Every row is a real staff member; the only thing computed here
 * is `mine` — true for the coach who holds this client's pod seat for that pillar.
 * That is the OWNER of the seat (raw `PodSeat`), not the cover: "your coach" in the
 * marketplace is who you signed up with, not who is standing in this week (the
 * cover-aware name belongs on Today and My Circle, where you actually talk to them).
 */
/**
 * `GET /client/trackers` — the tracker hub.
 *
 * THE SIX SIGNALS are real, derived from the client's own `trackers` blob through
 * the ported `trackerSignals`. The NUTRIENT PANEL (macros/micros) is the next pass
 * — it is a meals × nutrient-reference computation, not a blob read — and ships
 * empty until then, which the screen renders as "panel coming" rather than a wall
 * of zeros.
 */
export async function trackers(userId: string) {
  const client = await prisma.client.findFirst({ where: { userId }, select: { trackers: true } });
  if (!client) throw ApiError.notFound('No client record for this account.');
  return {
    signals: trackerSignals(client.trackers as Parameters<typeof trackerSignals>[0]),
    macros: [] as Array<{ name: string; value: string; state: string }>,
    micros: [] as Array<{ name: string; value: string; state: string }>,
  };
}

/** What the Quick-add sheet sends — every field optional; the body carries only what was entered. */
export type TrackerLog = {
  /** +N glasses of water — the "+1 glass" tap sends 1; capped at the day's target */
  waterAdd?: number;
  /** last night's sleep in MINUTES — becomes "6 h 40 m" and a % of the 8-hour need */
  sleepMins?: number;
  /** today's steps so far — an absolute reading the client (or a watch) sets */
  steps?: number;
  /** a fresh weigh-in in kg — updates the record's current weight */
  weightKg?: number;
};

/** The 8-hour need the demo measures sleep against, so a % has one definition. */
const SLEEP_NEED_MIN = 8 * 60;

/** 400 minutes → "6 h 40 m"; the whole hour drops the trailing " 0 m". */
function sleepLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
}

/**
 * `POST /client/trackers` — the Quick-add sheet's writes.
 *
 * A PARTIAL MERGE into the very `trackers` blob the six signals read and the
 * console's Trackers tab renders, so a glass logged here shows up in both at once
 * with no second copy to keep in step. Water is an INCREMENT — the "+1 glass" tap,
 * capped at the day's target so a double-tap cannot read 9/8; sleep and steps are
 * absolute readings; a weigh-in updates the record's current weight. Nothing typed
 * clears another field, because the body carries only what changed.
 */
export async function logTrackers(userId: string, patch: TrackerLog) {
  const c = await prisma.client.findFirst({
    where: { userId },
    select: { id: true, trackers: true },
  });
  if (!c) throw ApiError.notFound('No client record for this account.');

  const base = (c.trackers ?? {}) as {
    waterDone?: number;
    waterTarget?: number;
    sleep?: string;
    sleepPct?: number;
    steps?: number;
  };
  const next = { ...base };

  if (patch.waterAdd != null) {
    const target = base.waterTarget && base.waterTarget > 0 ? base.waterTarget : 8;
    next.waterDone = Math.max(0, Math.min(target, (base.waterDone ?? 0) + patch.waterAdd));
  }
  if (patch.sleepMins != null) {
    next.sleep = sleepLabel(patch.sleepMins);
    next.sleepPct = Math.max(0, Math.min(100, Math.round((patch.sleepMins / SLEEP_NEED_MIN) * 100)));
  }
  if (patch.steps != null) {
    next.steps = Math.max(0, Math.round(patch.steps));
  }

  const data: { trackers: typeof next; weightKg?: number } = { trackers: next };
  if (patch.weightKg != null) data.weightKg = patch.weightKg;

  await prisma.client.update({ where: { id: c.id }, data });

  /* read the six signals back from source, so the screen re-renders from what was
     actually stored rather than from an optimistic guess of the merge */
  return trackers(userId);
}

/** pillar key -> the pod seat that carries it. `culture` is the dietitian's. */
const PILLAR_POD_SEAT: Record<string, string> = {
  fitness: 'fitness',
  culture: 'dietitian',
  yoga: 'yoga',
  wellness: 'mind',
};

/**
 * THE PILLAR EACH COACH ROLE ANSWERS FOR — the marketplace's own axis.
 *
 * The inverse of `PILLAR_POD_SEAT`, stated rather than derived so a role that is
 * not a coaching seat (an admin, the Ops Head) simply is not here and therefore
 * is never offered to a client.
 */
const ROLE_PILLAR: Record<string, string> = {
  fitness: 'fitness',
  dietitian: 'culture',
  yoga: 'yoga',
  mind: 'wellness',
};

/** What the listing calls each of them — the demo's own words. */
const COACH_TITLE: Record<string, string> = {
  fitness: 'Fitness Expert',
  culture: 'Nutrition Expert',
  yoga: 'Yoga Expert',
  wellness: 'Mind Wellness Coach',
};

/** The listing a staff row carries, if anyone has filled one in. */
interface CoachListing {
  price?: number | null;
  years?: number | null;
  rating?: number | null;
  spec?: string[] | null;
}

/**
 * `GET /client/coaches` — the marketplace, BUILT FROM THE REAL TEAM.
 *
 * It used to be a typed module of twelve invented coaches. Two things were wrong
 * with that and both were visible from the app: a coach hired this morning could
 * never appear, and the prices a client read belonged to nobody. Every row here is
 * now a real, active staff member on that pillar.
 *
 * WHAT IS DERIVED AND WHAT IS STORED, deliberately split:
 *   - name, title, the one-line pitch: the staff record's own.
 *   - `clients`: COUNTED from the pod seats they actually hold, so it cannot be
 *     inflated by hand — the number a client is trusting is the real caseload.
 *   - `mine`: the caller's own pod, so their coach leads the list rather than
 *     appearing as somebody to connect with.
 *   - price, years, rating, spec: the listing, which somebody has to write. A
 *     seat with none is still SHOWN — hiding a real coach because nobody typed a
 *     price would be the old bug wearing a new hat — but the unwritten fields go
 *     out as `null`, never `0`. Zero is a claim: it renders as "FREE 0.0 stars,
 *     0 years", which is a worse lie about a real coach than saying nothing. The
 *     app prints an em dash for null.
 */
/** A listing number, or null when nobody has written one. NaN and 0 both mean unwritten. */
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function coaches(userId: string) {
  const c = await meFor(userId);

  const [seats, staff, caseloads] = await Promise.all([
    prisma.podSeat.findMany({ where: { clientId: c.id }, select: { seat: true, staffId: true } }),
    prisma.user.findMany({
      where: { status: 'active', role: { in: Object.keys(ROLE_PILLAR) as never[] } },
      select: { id: true, name: true, role: true, subtitle: true, tags: true, coach: true },
      orderBy: { name: 'asc' },
    }),
    /* the real caseload, in one grouped read rather than a query per coach */
    prisma.podSeat.groupBy({ by: ['staffId'], _count: { _all: true } }),
  ]);

  const staffForSeat = new Map(seats.map((s) => [s.seat as string, s.staffId]));
  const loadOf = new Map(caseloads.map((r) => [r.staffId, r._count._all]));

  const market: Record<string, unknown[]> = { fitness: [], culture: [], yoga: [], wellness: [] };

  for (const u of staff) {
    const pillar = ROLE_PILLAR[u.role];
    if (!pillar) continue;
    const listing = (u.coach ?? {}) as CoachListing;

    (market[pillar] ??= []).push({
      id: u.id,
      name: u.name,
      title: COACH_TITLE[pillar] ?? 'Coach',
      /* null, not 0: an unwritten field says nothing, a zero makes a claim */
      years: num(listing.years),
      rating: num(listing.rating),
      /* the ONE number that is honestly zero — it is counted, not typed */
      clients: loadOf.get(u.id) ?? 0,
      price: num(listing.price),
      /* the listing's own specialities, else the tags the team already keeps */
      spec: (listing.spec?.length ? listing.spec : u.tags).slice(0, 3),
      line: u.subtitle ?? '',
      mine: staffForSeat.get(PILLAR_POD_SEAT[pillar] ?? '') === u.id,
    });
  }

  return market;
}

/* ----------------------------------------------------------------- settings */

const defaultNotif = (): Record<string, boolean> =>
  Object.fromEntries(NOTIF_CATALOG.map((n) => [n.key, n.default]));

/**
 * `GET /client/settings` — the notification toggles, the announcements opt-out,
 * and the DPDP consents.
 *
 * The words are content (`settings-catalog`); only the on/off is per client, so a
 * client with no prefs row reads the catalog defaults and the screen is never
 * blank before the first toggle. The announce opt-out is read from
 * `ClientAnnouncePref` — the SAME row broadcast targeting reads — so opting out of
 * offers here removes the client from the next broadcast, with no second copy to
 * keep in step. Consents are display-only: the demo shows both "Granted" with no
 * withdraw path, and the client type carries no toggle for them.
 */
export async function settings(userId: string) {
  const c = await meFor(userId);
  const [prefs, announce] = await Promise.all([
    prisma.clientPrefs.findUnique({ where: { clientId: c.id }, select: { notifPrefs: true } }),
    prisma.clientAnnouncePref.findUnique({ where: { clientId: c.id }, select: { on: true } }),
  ]);
  const on = (prefs?.notifPrefs ?? {}) as Record<string, boolean>;

  return {
    notif: NOTIF_CATALOG.map((n) => ({
      key: n.key,
      label: n.label,
      sub: n.sub,
      on: on[n.key] ?? n.default,
    })),
    /* default ON: a client who has never touched it is opted in, which is what the
       demo shows and what broadcast targeting assumes until told otherwise */
    announce: { on: announce?.on ?? true, label: ANNOUNCE_COPY.label, sub: ANNOUNCE_COPY.sub },
    consents: CONSENT_CATALOG.map((row) => ({ id: row.id, name: row.name, sub: row.sub })),
  };
}

export type SettingsPatch = {
  notif?: Partial<Record<NotifKey, boolean>>;
  announce?: boolean;
};

/**
 * `PATCH /client/settings` — flip a notification toggle or the announcements
 * opt-out, and read the whole thing back.
 *
 * A PARTIAL MERGE. The body carries only what changed, and the notif map is
 * merged into what is stored, so a screen sending `{sleep:true}` never clears the
 * other three. Consents are not writable here — they have no toggle in the demo.
 */
export async function updateSettings(userId: string, patch: SettingsPatch) {
  const c = await meFor(userId);

  if (patch.notif && Object.keys(patch.notif).length) {
    const current = await prisma.clientPrefs.findUnique({
      where: { clientId: c.id },
      select: { notifPrefs: true },
    });
    const base = (current?.notifPrefs ?? defaultNotif()) as Record<string, boolean>;
    const merged = { ...base, ...patch.notif };
    await prisma.clientPrefs.upsert({
      where: { clientId: c.id },
      create: { clientId: c.id, notifPrefs: merged },
      update: { notifPrefs: merged },
    });
  }

  if (patch.announce !== undefined) {
    await prisma.clientAnnouncePref.upsert({
      where: { clientId: c.id },
      create: { clientId: c.id, on: patch.announce },
      update: { on: patch.announce },
    });
  }

  return settings(userId);
}

/* ------------------------------------------------------------------ arrival */

/** The four the demo offers — the app draws a face for each; the server keeps the key. */
export const MOOD_KEYS = ['happy', 'sad', 'angry', 'drained'] as const;
export type Mood = (typeof MOOD_KEYS)[number];

/**
 * `POST /client/arrival` — "How are you arriving?" for this morning.
 *
 * Keyed by CYCLE-DAY, mirroring the demo's `moodLog`: one answer per (cycle,
 * day), and answering again the same day changes it rather than stacking a
 * second. The mood the app reads back is on `today().arrival`, so the write
 * returns just the key it stored and the screen re-reads Today.
 *
 * Only the CURRENT cycle-day is writable — you arrive today, not on a day you
 * browsed back to. There is no id in the path: whose arrival it is comes from the
 * token, like everything else on this surface.
 */
export async function setArrival(userId: string, mood: Mood, note?: string | null) {
  const c = await meFor(userId);
  const existing = await prisma.clientMood.findFirst({
    where: { clientId: c.id, cycle: c.cycle, day: c.cycleDay },
    select: { id: true },
  });
  /*
   * An empty box CLEARS the note rather than being ignored. Somebody who wrote a
   * line, thought better of it and answered again meant to take it back, and a
   * console still showing it would be quoting a client against their wishes.
   */
  const clean = typeof note === 'string' && note.trim() ? note.trim() : null;

  /*
   * ONCE A DAY, AND THE FIRST ANSWER STANDS.
   *
   * The check-in asks how somebody is ARRIVING — a reading taken at a moment, not
   * a setting. Letting it be rewritten all day turns it into one: a client who
   * felt drained at seven and better by noon would overwrite the very thing the
   * coach needed to see, and the console's "notes behind the check-ins" would
   * quietly become a record of how the day ENDED rather than how it began.
   *
   * So a second answer on the same cycle-day is refused rather than merged. It is
   * a conflict, not a bad request: nothing about the body is wrong, the moment for
   * it has simply passed.
   */
  if (existing) {
    throw new ApiError(
      409,
      'already_answered',
      'You have already checked in today — tomorrow is a fresh one.',
    );
  }

  await prisma.clientMood.create({
    data: { clientId: c.id, cycle: c.cycle, day: c.cycleDay, mood, note: clean },
  });
  return { mood, note: clean };
}

/* --------------------------------------------------------------- push token */

/**
 * `POST /client/push-token` — register this device for notifications.
 *
 * UNIQUE ON THE TOKEN, not the client: a phone hands back the same Expo token
 * every launch, so re-registering updates the row rather than growing a pile of
 * duplicates, and a device that later signs in as a different client moves to
 * them (the token addresses the DEVICE, and the device now belongs to whoever
 * holds it). Sending the notifications is F3 — this is only where a device says
 * where to reach it.
 */
export async function registerPushToken(userId: string, token: string, platform?: string | null) {
  const c = await meFor(userId);
  await prisma.pushToken.upsert({
    where: { token },
    create: { clientId: c.id, token, platform: platform ?? null },
    update: { clientId: c.id, platform: platform ?? null },
  });
  return { registered: true };
}

/* ------------------------------------------------------------------- circle */

/** "Sneha M." → "Sneha", but "Dr. Kavya" stays whole — drop only a trailing initial. */
const shortName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1 && /^[A-Z]\.?$/.test(parts[parts.length - 1] ?? '')) parts.pop();
  return parts.join(' ');
};

/** The care team, in the order the strip names them — never admin or ops. */
const CIRCLE_TEAM_SEATS = ['dietitian', 'fitness', 'yoga', 'mind', 'doctor'] as const;

/** The client's own MessageKind → the five kinds the app's thread renders. */
const CIRCLE_KIND: Record<string, 'card' | 'doc' | 'meal' | 'rating' | 'text'> = {
  CARD: 'card',
  DOC: 'doc',
  MEAL: 'meal',
  RATING: 'rating',
  TEXT: 'text',
  PROMO: 'text',
  WISH: 'text',
};

/**
 * Unread for this client: visible messages past where they last read to.
 *
 * TEAMONLY lines are excluded because they never reach the client surface
 * (rule 2), so a team-only note must never light the client's dot. A client with
 * no read row has read nothing, so `lastSeq` is 0 and everything counts.
 */
/**
 * `POST /client/circle` — the client's own line into their thread.
 *
 * IT DID NOT EXIST, and its absence was a real hole: a client could read their
 * circle and never answer in it, so every conversation was one-way from the team.
 * A person on the rail needs it most — asking the onboarding team a question is
 * the only thing they CAN do while there is no plan yet.
 *
 * The author is the session, never the body. A client writing as anybody else is
 * the one thing a thread must make impossible, and the way to make it impossible
 * is to never read an author off the request.
 */
export async function postToCircle(userId: string, text: string) {
  const clean = String(text ?? '').trim();
  if (!clean) throw ApiError.badRequest('Write something first.');
  if (clean.length > 4000) throw ApiError.badRequest('That is longer than a message needs to be.');

  const pending = await arrivalCircle.arrivalFor(userId);
  if (pending) {
    const m = await arrivalCircle.post(pending.id, { fromKind: 'CLIENT', text: clean });
    return { id: m.id, at: m.createdAt.toISOString() };
  }

  const c = await meFor(userId);
  const m = await circleService.postMessage(c.id, {
    /* the client is the author and carries no staff id — `fromKind` is what the
       thread reads to put the bubble on the right-hand side */
    fromUserId: null,
    fromKind: 'CLIENT',
    kind: 'TEXT',
    text: clean,
  });
  return { id: m.id, at: m.createdAt.toISOString() };
}

export async function circleUnread(clientId: string): Promise<number> {
  const read = await prisma.circleRead.findUnique({
    where: { clientId },
    select: { lastSeq: true },
  });
  return prisma.circleMessage.count({
    where: { clientId, seq: { gt: read?.lastSeq ?? 0 }, ...clientVisibleMessages },
  });
}

/**
 * `GET /client/circle` — the care-circle thread, oldest first.
 *
 * RULE 2 IS THE FILTER: `clientVisibleMessages` drops every TEAMONLY line in the
 * query, so a team-only note is absent from the answer rather than hidden by the
 * phone. A meal card reads its slot and dishes off the linked plate, and a rating
 * card its stars and voice length off the plate's `finalStars`/`finalVoiceSec` —
 * one source of truth, never a copy on the message. Rule 3 still holds: an
 * observation client is shown no rating card, because no rating exists to show.
 */
export async function circle(userId: string) {
  /*
   * THE PRE-CLIENT THREAD, answered in the same shape.
   *
   * Somebody on the rail has no client record and so no care circle, but they do
   * have a conversation with the team running their onboarding — and it is the
   * one place they can ask why nothing has happened yet. The app draws ONE screen
   * for both; a screen that had to know which kind of thread it was reading
   * before it could draw a bubble is where the two would drift apart.
   */
  const pending = await arrivalCircle.arrivalFor(userId);
  if (pending) return arrivalCircle.thread(pending.id, pending.step);

  const c = await meFor(userId);
  const f = facts(c);

  const rows = await prisma.circleMessage.findMany({
    where: { clientId: c.id, ...clientVisibleMessages },
    orderBy: { seq: 'asc' },
    select: {
      id: true,
      kind: true,
      text: true,
      seq: true,
      createdAt: true,
      fromKind: true,
      mealId: true,
      fromUser: { select: { name: true, role: true } },
      meal: { select: { slot: true, dishes: true, finalStars: true, finalVoiceSec: true } },
    },
  });

  /* role titles for the staff authors present — "dietitian" reads "Dietician" */
  const roleKeys = [
    ...new Set(
      rows.map((r) => r.fromUser?.role as string | undefined).filter((v): v is string => !!v),
    ),
  ];
  const roleRows = roleKeys.length
    ? await prisma.role.findMany({ where: { key: { in: roleKeys } }, select: { key: true, title: true } })
    : [];
  const titleOf = new Map(roleRows.map((r) => [r.key, r.title]));

  const messages = rows
    /* rule 3: an observation client is never shown a rating, even a stray one */
    .filter((m) => !(m.kind === 'RATING' && !maySeeRating(f)))
    .map((m) => {
      const kind = CIRCLE_KIND[m.kind] ?? 'text';
      /* the client's own line sits on the right and names nobody; a staff line
         names "Name · Role"; an AI or pinned card names nobody either */
      const role = (m.fromUser?.role as string | undefined) ?? '';
      const who =
        m.fromKind === 'STAFF' && m.fromUser
          ? `${m.fromUser.name} · ${titleOf.get(role) ?? role}`
          : null;
      const base = {
        id: m.id,
        kind,
        mine: m.fromKind === 'CLIENT',
        who,
        text: m.text,
        ago: agoOf(m.createdAt),
      };
      if (kind === 'meal' && m.meal) {
        return { ...base, mealId: m.mealId, slot: m.meal.slot, dishes: m.meal.dishes };
      }
      if (kind === 'rating' && m.meal) {
        return {
          ...base,
          stars: m.meal.finalStars ?? undefined,
          voiceSec: m.meal.finalVoiceSec ?? undefined,
        };
      }
      return base;
    });

  /* who reads this — the care team by first name, in the strip's order */
  const seats = await pod(c.id);
  const bySeat = new Map(seats.map((s) => [s.seat, s.coach]));
  const names = CIRCLE_TEAM_SEATS.map((seat) => bySeat.get(seat)?.name)
    .filter((v): v is string => !!v)
    .map(shortName);
  const sub = `Your whole team reads this — ${names.join(', ')}`;

  /* older day-sessions exist when a visible line predates today */
  const hasHistory = rows.some((r) => r.createdAt < asDate(todayISO()));

  return { sub, hasHistory, messages };
}

/**
 * `POST /client/circle/read` — mark the thread caught up.
 *
 * Moves the client's read cursor to the newest visible message, which is what
 * clears the unread dot on `/client/me`. A GET could not do this: a read that
 * clears your own notice would be lost to any prefetch — the same reasoning the
 * Deviations board's `seen` write records.
 */
export async function markCircleRead(userId: string) {
  const c = await meFor(userId);
  const top = await prisma.circleMessage.aggregate({
    where: { clientId: c.id, ...clientVisibleMessages },
    _max: { seq: true },
  });
  const lastSeq = top._max.seq ?? 0;
  await prisma.circleRead.upsert({
    where: { clientId: c.id },
    create: { clientId: c.id, lastSeq },
    update: { lastSeq },
  });
  return { unread: 0, lastSeq };
}
