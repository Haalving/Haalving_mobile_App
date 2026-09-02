import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp, loginStaff } from './helpers.js';

/**
 * THE CLIENT SURFACE — the five rules, and the door.
 *
 * These tests are the reason `services/client-app/rules.ts` exists as one file.
 * Each rule is asserted against the ANSWER THE SERVER GIVES, never against a
 * helper called in isolation: the guarantee the app relies on is that the field is
 * absent from the payload, and a unit test of the guard would still pass if a new
 * endpoint forgot to call it.
 */

const RAJESH_PHONE = '+919847022110'; /* Poorna, cycle 3 day 6 — the active state */
const PRIYA_PHONE = '+919746041190'; /* observation — the other state */

let rajesh: string;
let priya: string;
let anita: Awaited<ReturnType<typeof loginStaff>>;

/** A client signs in the way a client does: a phone and a one-time code. */
async function clientToken(phone: string, code: string): Promise<string> {
  await issueTestOtp(phone, code);
  const res = await request(app)
    .post('/api/v1/auth/client/otp/verify')
    .set('X-Client', 'mobile')
    .send({ phone, code });
  expect(res.status, `otp verify for ${phone}`).toBe(200);
  return res.body.data.accessToken as string;
}

const get = (token: string, path: string) =>
  request(app)
    .get(`/api/v1${path}`)
    .set(...auth(token));

const post = (token: string, path: string, body?: object) =>
  request(app)
    .post(`/api/v1${path}`)
    .set(...auth(token))
    .send(body ?? {});

beforeAll(async () => {
  await clearRateLimits();
  [rajesh, priya, anita] = await Promise.all([
    clientToken(RAJESH_PHONE, '424242'),
    clientToken(PRIYA_PHONE, '434343'),
    loginStaff('anita'),
  ]);
});

/* the OTP door is rate limited, and this suite opens it repeatedly */
beforeEach(clearRateLimits);

afterAll(async () => {
  /* only the windows this file created. `leaveId: null` alone would reach across
     every client and take another suite's fixture with it; the seed's own cover
     carries `lv-0` and is not ours to remove. */
  await prisma.podCover.deleteMany({ where: { clientId: 'c-rajesh', seatKey: 'yoga' } });
  await closeConnections();
});

/* ─────────────────────────────────────────────────── the door itself */

describe('the audience split', () => {
  it('refuses a staff token every client route', async () => {
    /*
     * THE DIRECTION THAT MATTERS. A staff token is legitimate and scoping alone
     * would hand back a plausible answer; the door refuses it instead, so the
     * client surface is not reachable from the console at all.
     */
    for (const path of ['/client/me', '/client/today', '/client/profile']) {
      expect((await get(anita.accessToken, path)).status, path).toBe(403);
    }
  });

  it('refuses a client token the console surface', async () => {
    for (const path of ['/clients', '/queues/worklist', '/community/gatherings']) {
      expect((await get(rajesh, path)).status, path).toBe(403);
    }
  });

  it('takes no client id anywhere — the token is the only answer', async () => {
    /* Rajesh's token cannot be pointed at Priya by any parameter this surface
       accepts, because it accepts none */
    const mine = (await get(rajesh, '/client/me')).body.data;
    const hers = (await get(priya, '/client/me')).body.data;
    expect(mine.id).toBe('c-rajesh');
    expect(hers.id).not.toBe(mine.id);
  });
});

/* ────────────────────────────────────────────────────────── GET /me */

describe('GET /client/me', () => {
  it('answers the facts a screen needs before it can draw', async () => {
    const res = await get(rajesh, '/client/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: 'c-rajesh',
      plan: 'POORNA',
      cycle: 3,
      day: 6,
      observation: false,
    });
    expect(res.body.data.levels).toBeTruthy();
  });

  it('marks an observation client, because the app routes on it', async () => {
    const res = await get(priya, '/client/me');
    expect(res.body.data.observation).toBe(true);
  });
});

/* ──────────────────────────────────────── RULE 4 — cover-aware names */

describe('rule 4 — a covered seat names the cover, not the owner', () => {
  /*
   * THE YOGA SEAT, not the dietitian's.
   *
   * The seed already covers Rajesh's dietitian seat — Divya stands in for Sneha
   * while she is on leave `lv-0` — and the API resolves it correctly, which is how
   * this rule was first confirmed. But that window is two dates in the seed, so a
   * test written against it passes today and fails whenever the relative dates
   * move: the same date-dependent trap the proposal test carried. Yoga has no
   * seeded cover, so a window created here is the only one in play.
   */
  const seat = 'yoga';
  const owner = 'u-lakshmi';
  const stand_in = 'u-nikhil';

  const utcDay = (d = new Date()) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const podOf = async () =>
    (await get(rajesh, '/client/me')).body.data.pod as Array<{
      seat: string;
      coach: { id: string; name: string } | null;
      covering: boolean;
    }>;

  it('names the owner while nobody is standing in', async () => {
    const p = (await podOf()).find((x) => x.seat === seat);
    expect(p?.coach?.id).toBe(owner);
    expect(p?.covering).toBe(false);
  });

  it('names the stand-in the moment a cover is running', async () => {
    /*
     * THE DAY THE NAME MATTERS MOST. `seatHolder` answers the OWNER — right on
     * every other day, wrong on exactly this one, which is the day the client
     * needs to know who will actually answer. Hence activeCovers + resolveSeat.
     */
    const day = utcDay();
    await prisma.podCover.create({
      data: { clientId: 'c-rajesh', seatKey: seat, coverId: stand_in, from: day, to: day },
    });

    const p = (await podOf()).find((x) => x.seat === seat);
    expect(p?.coach?.id).toBe(stand_in);
    expect(p?.covering).toBe(true);

    await prisma.podCover.deleteMany({ where: { clientId: 'c-rajesh', seatKey: seat } });
  });

  it('goes back to the owner once the window has passed', async () => {
    const past = new Date(Date.UTC(2020, 0, 1));
    await prisma.podCover.create({
      data: { clientId: 'c-rajesh', seatKey: seat, coverId: stand_in, from: past, to: past },
    });

    const p = (await podOf()).find((x) => x.seat === seat);
    expect(p?.coach?.id).toBe(owner);
    expect(p?.covering).toBe(false);

    await prisma.podCover.deleteMany({ where: { clientId: 'c-rajesh', seatKey: seat } });
  });

  it('resolves the seed’s own cover too, whenever its window is open', async () => {
    /* asserted CONDITIONALLY, on the window rather than the calendar — the point
       is that the resolution agrees with the data, not that today is a Tuesday */
    const day = utcDay();
    const seeded = await prisma.podCover.findFirst({
      where: { clientId: 'c-rajesh', seatKey: 'dietitian', from: { lte: day }, to: { gte: day } },
      select: { coverId: true },
    });
    const diet = (await podOf()).find((x) => x.seat === 'dietitian');
    if (seeded) {
      expect(diet?.coach?.id).toBe(seeded.coverId);
      expect(diet?.covering).toBe(true);
    } else {
      expect(diet?.coach?.id).toBe('u-sneha');
      expect(diet?.covering).toBe(false);
    }
  });
});

/* ───────────────────────────────────────────────────── GET /today */

describe('GET /client/today', () => {
  it('gives an active client their own day', async () => {
    const res = await get(rajesh, '/client/today');
    expect(res.status).toBe(200);
    expect(res.body.data.observation).toBe(false);
    expect(Array.isArray(res.body.data.sessions)).toBe(true);
  });

  it('rule 3 — an observation client gets no sessions at all', async () => {
    const res = await get(priya, '/client/today');
    expect(res.body.data.observation).toBe(true);
    expect(res.body.data.sessions).toHaveLength(0);
  });

  it('refuses a day that is not a day', async () => {
    expect((await get(rajesh, '/client/today?day=yesterday')).status).toBe(400);
  });
});

/* ─────────────────────────────────── RULES 1 and 3 — the plate */

describe('the plate', () => {
  it('rule 1 — a Poorna client never sees the AI reading', async () => {
    /*
     * Rajesh has a human on all four pillars, so the AI's guess at his plate is
     * working material for the coach who corrects it. Showing it would make the
     * coach's rating read as a second opinion on a machine.
     */
    const meals = (await get(rajesh, '/client/today')).body.data.meals as Array<
      Record<string, unknown>
    >;
    for (const m of meals) {
      for (const f of ['ai', 'aiStars', 'aiConf', 'aiDetected', 'aiNote', 'aiDraft']) {
        expect(m, `${f} must not reach a Poorna client`).not.toHaveProperty(f);
      }
    }
  });

  it('rule 3 — an observation client is capture-only, with no rating', async () => {
    const meals = (await get(priya, '/client/today')).body.data.meals as Array<
      Record<string, unknown>
    >;
    for (const m of meals) {
      expect(m.stars).toBeNull();
      expect(m.note).toBeNull();
    }
  });

  it('never serialises the raw final columns under their own names', async () => {
    /* the app reads `stars`; `finalStars` is the table's word and stays there */
    const meals = (await get(rajesh, '/client/today')).body.data.meals as Array<
      Record<string, unknown>
    >;
    for (const m of meals) {
      expect(m).not.toHaveProperty('finalStars');
      expect(m).not.toHaveProperty('finalNote');
    }
  });
});

/* ──────────────────────────────── POST /sessions/:id/join */

describe('POST /client/sessions/:id/join', () => {
  it('404s a session that is not yours', async () => {
    /* a 403 would confirm the id names something real, which is the fact the
       404-not-403 rule exists to protect */
    const someone = await prisma.task.findFirst({
      where: { kind: 'SESSION', clientId: { not: 'c-rajesh' } },
      select: { id: true },
    });
    if (!someone) return;
    expect((await post(rajesh, `/client/sessions/${someone.id}/join`)).status).toBe(404);
  });

  it('404s an id that names nothing', async () => {
    expect((await post(rajesh, '/client/sessions/not-a-session/join')).status).toBe(404);
  });

  it('opens the stored link and records that it was opened', async () => {
    const mine = await prisma.task.findFirst({
      where: { kind: 'SESSION', clientId: 'c-rajesh', link: { not: null } },
      select: { id: true, link: true },
    });
    if (!mine) return;

    const since = new Date();
    const res = await post(rajesh, `/client/sessions/${mine.id}/join`);
    expect(res.status).toBe(200);
    expect(res.body.data.link).toBe(mine.link);

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'client.session_joined', subjectId: mine.id, at: { gte: since } },
    });
    expect(logged, 'a join leaves a record — it is the only evidence of turning up').not.toBeNull();
  });
});

/* ───────────────────────────────────────────────── GET /profile */

describe('GET /client/profile', () => {
  it('answers the read side', async () => {
    const res = await get(rajesh, '/client/profile');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toMatch(/Rajesh/);
    expect(res.body.data.pillars).toEqual(['fitness', 'culture', 'yoga', 'wellness']);
  });

  it('rule 5 — the Records Vault holds signed summaries only', async () => {
    const pending = await prisma.medicalSummary.count({
      where: { clientId: 'c-rajesh', status: 'PENDING' },
    });
    const records = (await get(rajesh, '/client/profile')).body.data.records as Array<{
      id: string;
    }>;
    const ids = records.map((r) => r.id);
    const unsigned = await prisma.medicalSummary.findMany({
      where: { clientId: 'c-rajesh', status: 'PENDING' },
      select: { id: true },
    });
    for (const u of unsigned) {
      expect(ids, 'an unsigned summary is a reading no human has stood behind').not.toContain(u.id);
    }
    expect(pending).toBeGreaterThanOrEqual(0);
  });
});

/* ──────────────────────────────────────── the community read */

describe('GET /client/community/gatherings', () => {
  it('gives a client the approved list only', async () => {
    const res = await get(rajesh, '/client/community/gatherings');
    expect(res.status).toBe(200);

    const ids = (res.body.data as Array<{ id: string }>).map((g) => g.id);
    const pending = await prisma.gathering.findMany({
      where: { approvedAt: null },
      select: { id: true },
    });
    for (const p of pending) {
      expect(ids, 'a proposal is not the community’s until somebody lets it out').not.toContain(
        p.id,
      );
    }
  });

  it('carries no approval state — there is nothing here to act on', async () => {
    const rows = (await get(rajesh, '/client/community/gatherings')).body.data as Array<
      Record<string, unknown>
    >;
    for (const g of rows) {
      expect(g).not.toHaveProperty('status');
      expect(g).not.toHaveProperty('returnNote');
      expect(g).not.toHaveProperty('mine');
    }
  });
});

/* ────────────────────────────────────────────────────────── capturing a plate */

describe('POST /client/meals', () => {
  /** Everything this block creates, so the suite leaves the seed as it found it. */
  const mine: string[] = [];

  afterAll(async () => {
    if (mine.length) await prisma.meal.deleteMany({ where: { id: { in: mine } } });
  });

  it('logs the four things the client is the author of', async () => {
    const res = await post(rajesh, '/client/meals', {
      slot: 'Lunch',
      fullness: 'Just right',
      dishes: ['Vegetable pulao', 'Raita'],
    });
    expect(res.status).toBe(201);
    mine.push(res.body.data.id);

    const row = await prisma.meal.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.slot).toBe('Lunch');
    expect(row.fullness).toBe('Just right');
    expect(row.dishes).toEqual(['Vegetable pulao', 'Raita']);
    expect(row.clientId).toBe('c-rajesh');
  });

  it('leaves the plate unrated, which is what puts it on the dietitian queue', async () => {
    const res = await post(rajesh, '/client/meals', {
      slot: 'Dinner',
      fullness: 'Light',
      dishes: ['Phulka'],
    });
    expect(res.status).toBe(201);
    mine.push(res.body.data.id);

    const row = await prisma.meal.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.finalStars).toBeNull();
    expect(row.ratedAt).toBeNull();
  });

  it('records no AI pre-score, because no AI has looked at it', async () => {
    const res = await post(rajesh, '/client/meals', {
      slot: 'Snack',
      fullness: 'Light',
      dishes: ['Sprouts'],
    });
    mine.push(res.body.data.id);

    const row = await prisma.meal.findUniqueOrThrow({ where: { id: res.body.data.id } });
    /* zeros here would be a fabricated assessment — and the worst possible one —
       shown to the dietitian who has to rate the plate */
    expect(row.aiStars).toBeNull();
    expect(row.aiConf).toBeNull();
    expect(row.aiNote).toBeNull();
    expect(row.aiDetected).toEqual([]);
  });

  it('stamps capturedAt from the server, not from the request', async () => {
    const before = Date.now();
    const res = await post(rajesh, '/client/meals', {
      slot: 'Breakfast',
      fullness: 'Just right',
      dishes: ['Idli'],
      /* a client who could choose this could park their plate at the front of the
         meals queue, or at the back of it for ever with a wrong phone clock */
      capturedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(201);
    mine.push(res.body.data.id);

    const row = await prisma.meal.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.capturedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('refuses a plate with nothing on it', async () => {
    const res = await post(rajesh, '/client/meals', {
      slot: 'Lunch',
      fullness: 'Light',
      dishes: [],
    });
    expect(res.status).toBe(400);
  });

  it('refuses a slot the meal plan does not teach', async () => {
    const res = await post(rajesh, '/client/meals', {
      slot: 'Elevenses',
      fullness: 'Light',
      dishes: ['Tea'],
    });
    expect(res.status).toBe(400);
  });

  it('is closed to staff', async () => {
    const res = await request(app)
      .post('/api/v1/client/meals')
      .set(...auth(anita.accessToken))
      .send({ slot: 'Lunch', fullness: 'Light', dishes: ['Rice'] });
    expect(res.status).toBe(403);
  });
});

describe('GET /client/meals/:id', () => {
  let mealId: string;

  beforeAll(async () => {
    const res = await post(rajesh, '/client/meals', {
      slot: 'Lunch',
      fullness: 'Stuffed',
      dishes: ['Biryani'],
    });
    mealId = res.body.data.id;
  });

  afterAll(async () => {
    await prisma.meal.deleteMany({ where: { id: mealId } });
  });

  it('serves the plate the client logged', async () => {
    const res = await get(rajesh, `/client/meals/${mealId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.slot).toBe('Lunch');
    expect(res.body.data.dishes).toEqual(['Biryani']);
    /* freshly logged, active client — no rating yet, so `final` is absent and the
       pending line names who will rate it */
    expect(res.body.data.observation).toBe(false);
    expect(res.body.data.final).toBeNull();
    expect(typeof res.body.data.pendingLine).toBe('string');
    expect(res.body.data.pendingLine).toContain('sees this exactly as you sent it');
    /* a display string, computed once on the server so the two clocks agree */
    expect(typeof res.body.data.ago).toBe('string');
  });

  it('serves the human rating on a rated plate, named by first name', async () => {
    const res = await get(rajesh, '/client/meals/m-raj-bf');
    expect(res.status).toBe(200);
    const f = res.body.data.final;
    expect(f).not.toBeNull();
    expect(f.stars).toBe(4);
    expect(f.isAI).toBe(false);
    /* a human rater is named by first name only — no space, never the full name */
    expect(f.byName).toBeTruthy();
    expect(f.byName).not.toContain(' ');
    /* the rubric arrives as a list of {label,value}, however it was stored */
    expect(Array.isArray(f.rubric)).toBe(true);
    /* a rated plate has no pending line */
    expect(res.body.data.pendingLine).toBeNull();
  });

  it('never serves the AI pre-score to a client whose Nutrition seat is human', async () => {
    const res = await get(rajesh, `/client/meals/${mealId}`);
    /* rule 1 — absent from the payload, not hidden by the phone */
    expect(res.body.data).not.toHaveProperty('aiStars');
    expect(res.body.data).not.toHaveProperty('aiConf');
    expect(res.body.data).not.toHaveProperty('aiNote');
    expect(res.body.data).not.toHaveProperty('aiDetected');
  });

  it('answers 404 for a meal that is not this client’s', async () => {
    const someoneElse = await prisma.meal.findFirst({
      where: { clientId: { not: 'c-rajesh' } },
      select: { id: true },
    });
    expect(someoneElse, 'the seed has another client with a meal').toBeTruthy();

    const res = await get(rajesh, `/client/meals/${someoneElse!.id}`);
    /* 404 rather than 403: a 403 would confirm the meal exists */
    expect(res.status).toBe(404);
  });

  it('shows no rating through observation, and says nothing is expected', async () => {
    const made = await post(priya, '/client/meals', {
      slot: 'Breakfast',
      fullness: 'Light',
      dishes: ['Upma'],
    });
    expect(made.status).toBe(201);

    const res = await get(priya, `/client/meals/${made.body.data.id}`);
    expect(res.status).toBe(200);
    /* rule 3 — in observation nobody rates anything: no `final`, and no pending
       line either (the screen shows the capture-only notice off `observation`) */
    expect(res.body.data.observation).toBe(true);
    expect(res.body.data.final).toBeNull();
    expect(res.body.data.pendingLine).toBeNull();

    await prisma.meal.deleteMany({ where: { id: made.body.data.id } });
  });
});

/* ───────────────────────────────────────────────────── settings */

describe('settings', () => {
  const patch = (token: string, body: object) =>
    request(app)
      .patch('/api/v1/client/settings')
      .set(...auth(token))
      .send(body);

  /* the announce opt-out shares its row with broadcast targeting, so this suite
     restores whatever the seed left rather than truncating it out from under
     community.test.ts */
  let originalAnnounce: boolean | null = null;
  beforeAll(async () => {
    const a = await prisma.clientAnnouncePref.findUnique({
      where: { clientId: 'c-rajesh' },
      select: { on: true },
    });
    originalAnnounce = a?.on ?? null;
  });
  afterAll(async () => {
    await prisma.clientPrefs.deleteMany({ where: { clientId: 'c-rajesh' } });
    if (originalAnnounce === null) {
      await prisma.clientAnnouncePref.deleteMany({ where: { clientId: 'c-rajesh' } });
    } else {
      await prisma.clientAnnouncePref.upsert({
        where: { clientId: 'c-rajesh' },
        create: { clientId: 'c-rajesh', on: originalAnnounce },
        update: { on: originalAnnounce },
      });
    }
  });

  type Toggle = { key: string; label: string; sub: string; on: boolean };
  type Consent = { id: string; name: string; sub: string; on?: boolean };

  it('reads the four toggles at their catalog defaults, and two consents', async () => {
    await prisma.clientPrefs.deleteMany({ where: { clientId: 'c-rajesh' } });
    const res = await get(rajesh, '/client/settings');
    expect(res.status).toBe(200);
    const notif = res.body.data.notif as Toggle[];
    expect(notif.map((n) => n.key)).toEqual(['water', 'workout', 'meals', 'sleep']);
    const on = Object.fromEntries(notif.map((n) => [n.key, n.on]));
    expect(on).toEqual({ water: true, workout: true, meals: true, sleep: false });
    /* the words are content, not data — every row carries them */
    expect(notif.every((n) => !!n.label && !!n.sub)).toBe(true);
    const consents = res.body.data.consents as Consent[];
    expect(consents.map((c) => c.id)).toEqual(['health', 'mealai']);
    /* consents are display-only — the demo gives them no toggle */
    expect(consents.every((c) => c.on === undefined)).toBe(true);
  });

  it('merges a notif toggle without clearing the others', async () => {
    const p = await patch(rajesh, { notif: { sleep: true } });
    expect(p.status).toBe(200);
    const res = await get(rajesh, '/client/settings');
    const on = Object.fromEntries((res.body.data.notif as Toggle[]).map((n) => [n.key, n.on]));
    expect(on).toEqual({ water: true, workout: true, meals: true, sleep: true });
  });

  it('writes the announce opt-out to the SAME row broadcast targeting reads', async () => {
    const res = await patch(rajesh, { announce: false });
    expect(res.status).toBe(200);
    expect(res.body.data.announce.on).toBe(false);
    const row = await prisma.clientAnnouncePref.findUnique({
      where: { clientId: 'c-rajesh' },
      select: { on: true },
    });
    expect(row?.on).toBe(false);
  });

  it('refuses an empty patch', async () => {
    const res = await patch(rajesh, {});
    expect(res.status).toBe(400);
  });

  it('refuses a staff token the client settings surface', async () => {
    const res = await request(app)
      .get('/api/v1/client/settings')
      .set(...auth(anita.accessToken));
    expect(res.status).toBe(403);
  });
});

/* ───────────────────────────────────────────────────── arrival */

describe('arrival', () => {
  afterAll(async () => {
    await prisma.clientMood.deleteMany({ where: { clientId: 'c-rajesh' } });
  });

  it('reads null before any answer', async () => {
    await prisma.clientMood.deleteMany({ where: { clientId: 'c-rajesh' } });
    const res = await get(rajesh, '/client/today');
    expect(res.status).toBe(200);
    expect(res.body.data.arrival).toEqual({ mood: null });
  });

  it('records the morning mood, and Today reads it back', async () => {
    const p = await post(rajesh, '/client/arrival', { mood: 'happy' });
    expect(p.status).toBe(200);
    expect(p.body.data.mood).toBe('happy');
    const res = await get(rajesh, '/client/today');
    expect(res.body.data.arrival.mood).toBe('happy');
  });

  it('changes the answer rather than stacking a second for the day', async () => {
    await post(rajesh, '/client/arrival', { mood: 'happy' });
    await post(rajesh, '/client/arrival', { mood: 'drained' });
    const res = await get(rajesh, '/client/today');
    expect(res.body.data.arrival.mood).toBe('drained');
    /* one answer per cycle-day — a second tap edits, it does not stack */
    const rows = await prisma.clientMood.count({ where: { clientId: 'c-rajesh' } });
    expect(rows).toBe(1);
  });

  it('refuses a mood that is not one of the four', async () => {
    const res = await post(rajesh, '/client/arrival', { mood: 'ecstatic' });
    expect(res.status).toBe(400);
  });

  it('is closed to staff', async () => {
    const res = await request(app)
      .post('/api/v1/client/arrival')
      .set(...auth(anita.accessToken))
      .send({ mood: 'happy' });
    expect(res.status).toBe(403);
  });
});
