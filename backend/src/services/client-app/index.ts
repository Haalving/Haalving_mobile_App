import { PILLAR_KEYS } from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/apiResponse.js';
import { todayISO } from '../../utils/dates.js';
import * as audit from '../audit.service.js';
import { activeCovers, resolveSeat } from '../covers.service.js';
import { COACH_MARKET, PILLAR_POD_SEAT, type MarketCoach } from './coach-market.js';
import {
  clientVisibleMessages,
  isObservation,
  maySeeRating,
  stripAi,
  type ClientFacts,
} from './rules.js';
import { ANNOUNCE_COPY, CONSENT_CATALOG, NOTIF_CATALOG, type NotifKey } from './settings-catalog.js';

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

/** `GET /client/me` — the facts every screen needs before it can draw anything. */
export async function me(userId: string) {
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

  return {
    id: c.id,
    name: c.name,
    plan: c.plan,
    cycle: c.cycle,
    day: c.cycleDay,
    /* the app routes on this: observation gets a different Today and Journey */
    observation: isObservation(f),
    levels: c.levels,
    pod: seats,
    unread,
  };
}

/** The plate and its counter. Rules 1 and 3 both land here. */
async function mealsFor(clientId: string, date: Date, f: ClientFacts) {
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

  return rows.map((m) => {
    const shaped = stripAi({ ...m }, f, 'culture') as Record<string, unknown>;
    delete shaped.finalStars;
    delete shaped.finalNote;
    return {
      ...shaped,
      capturedAt: m.capturedAt.toISOString(),
      /*
       * Rule 3. In observation nobody has rated anything, and printing a null
       * where a rating goes reads as a coach who has not got round to it rather
       * than a baseline week where rating is not the point.
       */
      stars: maySeeRating(f) ? m.finalStars : null,
      note: maySeeRating(f) ? m.finalNote : null,
    };
  });
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
      meals: await mealsFor(c.id, date, f),
      arrival,
    };
  }

  const rows = await prisma.task.findMany({
    where: { clientId: c.id, date, kind: 'SESSION' },
    orderBy: [{ startMin: 'asc' }],
    select: {
      id: true,
      title: true,
      pillar: true,
      startMin: true,
      durMin: true,
      link: true,
      dones: { where: { date }, select: { at: true }, take: 1 },
    },
  });

  const seats = await pod(c.id);
  const byPillar = new Map(seats.map((s) => [s.seat, s.coach]));

  return {
    observation: false as const,
    date: iso,
    cycle: c.cycle,
    day: c.cycleDay,
    sessions: rows.map((t) => ({
      id: t.id,
      title: t.title,
      pillar: t.pillar,
      startMin: t.startMin,
      durMin: t.durMin,
      /*
       * The join door. Whether there IS a room is served; the room is not built
       * here by instruction, and the link itself only leaves the server when the
       * client actually opens it — see `joinSession`.
       */
      joinable: !!t.link,
      done: t.dones.length > 0,
      coach: t.pillar ? (byPillar.get(t.pillar) ?? null) : null,
    })),
    meals: await mealsFor(c.id, date, f),
    arrival,
  };
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
 * The list is reference content (`coach-market.ts`); the only thing computed here
 * is `mine` — true for the coach who holds this client's pod seat for that pillar.
 * That is the OWNER of the seat (raw `PodSeat`), not the cover: "your coach" in the
 * marketplace is who you signed up with, not who is standing in this week (the
 * cover-aware name belongs on Today and My Circle, where you actually talk to them).
 */
export async function coaches(userId: string) {
  const c = await meFor(userId);
  const seats = await prisma.podSeat.findMany({
    where: { clientId: c.id },
    select: { seat: true, staffId: true },
  });
  const staffForSeat = new Map(seats.map((s) => [s.seat as string, s.staffId]));

  const shape = (co: MarketCoach, mineId: string | null | undefined) => ({
    id: co.id,
    name: co.name,
    title: co.title,
    years: co.years,
    rating: co.rating,
    clients: co.clients,
    price: co.price,
    spec: co.spec,
    line: co.line,
    mine: !!co.staffId && co.staffId === mineId,
  });

  const market: Record<string, ReturnType<typeof shape>[]> = {};
  for (const [pillar, list] of Object.entries(COACH_MARKET)) {
    const mineId = staffForSeat.get(PILLAR_POD_SEAT[pillar] ?? '');
    market[pillar] = list.map((co) => shape(co, mineId));
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
export async function setArrival(userId: string, mood: Mood) {
  const c = await meFor(userId);
  const existing = await prisma.clientMood.findFirst({
    where: { clientId: c.id, cycle: c.cycle, day: c.cycleDay },
    select: { id: true },
  });
  if (existing) {
    await prisma.clientMood.update({ where: { id: existing.id }, data: { mood } });
  } else {
    await prisma.clientMood.create({
      data: { clientId: c.id, cycle: c.cycle, day: c.cycleDay, mood },
    });
  }
  return { mood };
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
