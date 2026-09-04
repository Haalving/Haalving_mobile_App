import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { TEMPLATE_PILLARS } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp, loginStaff, type Session } from './helpers.js';

/**
 * THE PLAN TAB — a ticket per pillar, and the one promise behind it.
 *
 * Every write here lands on a draft the console reads and the client app does
 * not; Approve copies it onto the live plan wholesale. The test that matters most
 * is the last step of that chain: a Nutrition day edited on the record, approved,
 * and then read back through `GET /client/today` as the client — the plate the
 * phone draws is the plate the coach just wrote. Everything else is the demo's
 * own rules, asserted against the answer the server gives.
 *
 * Rajesh is the subject throughout: cycle 3 day 6, on a published plan in every
 * pillar, with Vikram (fitness), Lakshmi (yoga) and Dr Kavya on his pod. His
 * seeded rows are snapshotted first and put back exactly at the end, so the
 * suites after this one read the same story they always did.
 */

const CLIENT = 'c-rajesh';
const RAJESH_PHONE = '+919847022110';

let anita: Session; /* Super Admin — assignPlan, every pillar */
let vikram: Session; /* Fitness Coach — editCatalog, fitness only */
let lakshmi: Session; /* Yoga Coach — editCatalog, yoga only */
let kavya: Session; /* Doctor — reads every plan she carries, sets none */
let rajesh: string; /* the client's own token */

type PlanRow = Prisma.ClientPlanGetPayload<Record<string, never>>;
let snapshot: PlanRow[] = [];

const api = (s: Session) => ({
  get: (p: string) => request(app).get(`/api/v1${p}`).set(...auth(s.accessToken)),
  put: (p: string, body?: object) => request(app).put(`/api/v1${p}`).set(...auth(s.accessToken)).send(body ?? {}),
  patch: (p: string, body?: object) => request(app).patch(`/api/v1${p}`).set(...auth(s.accessToken)).send(body ?? {}),
  post: (p: string, body?: object) => request(app).post(`/api/v1${p}`).set(...auth(s.accessToken)).send(body ?? {}),
  del: (p: string) => request(app).delete(`/api/v1${p}`).set(...auth(s.accessToken)),
});

const clientGet = (p: string) => request(app).get(`/api/v1${p}`).set(...auth(rajesh));

const plan = (s: Session) => api(s).get(`/clients/${CLIENT}/plan`);
const pillarOf = (body: { pillars: Array<{ pillar: string }> }, p: string) =>
  body.pillars.find((x) => x.pillar === p) as Record<string, any>;

/** A client signs in the way a client does: a phone and a one-time code. */
async function clientToken(phone: string, code: string): Promise<string> {
  await issueTestOtp(phone, code);
  const res = await request(app).post('/api/v1/auth/client/otp/verify').set('X-Client', 'mobile').send({ phone, code });
  expect(res.status, `otp verify for ${phone}`).toBe(200);
  return res.body.data.accessToken as string;
}

const jsonOrNull = (v: Prisma.JsonValue | null) => (v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

/** Put Rajesh's plan rows back exactly as the seed left them. */
async function restore(): Promise<void> {
  await prisma.clientPlan.deleteMany({ where: { clientId: CLIENT } });
  for (const r of snapshot) {
    await prisma.clientPlan.create({
      data: {
        id: r.id,
        clientId: r.clientId,
        pillar: r.pillar,
        templateId: r.templateId,
        overrides: r.overrides as Prisma.InputJsonValue,
        time: r.time,
        dose: jsonOrNull(r.dose),
        targets: jsonOrNull(r.targets),
        ticket: jsonOrNull(r.ticket),
        log: r.log as Prisma.InputJsonValue,
        assignedById: r.assignedById,
        assignedAt: r.assignedAt,
        createdAt: r.createdAt,
      },
    });
  }
}

/** No ticket open on any of Rajesh's pillars — the state every test starts from. */
async function clearTickets(): Promise<void> {
  await prisma.clientPlan.updateMany({ where: { clientId: CLIENT }, data: { ticket: Prisma.JsonNull } });
}

beforeAll(async () => {
  await clearRateLimits();
  snapshot = await prisma.clientPlan.findMany({ where: { clientId: CLIENT } });
  await clearTickets();
  [anita, vikram, lakshmi, kavya, rajesh] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('lakshmi'),
    loginStaff('kavya'),
    clientToken(RAJESH_PHONE, '454545'),
  ]);
});

beforeEach(clearRateLimits);

afterAll(async () => {
  await restore();
  /* anything promoted out of Rajesh's plan by a test */
  await prisma.planTemplate.deleteMany({ where: { forClientId: CLIENT } });
  await closeConnections();
});

/* ─────────────────────────────────────────────────────────── the reading */

describe('GET /clients/:id/plan', () => {
  it('answers the five shelves in order, the view being live when nothing is staged', async () => {
    const res = await plan(anita);
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(p.clientId).toBe(CLIENT);
    expect(p.firstName).toBe('Rajesh');
    expect(p.cycle).toBe(3);
    expect(p.day).toBe(6);
    expect(p.shape).toMatchObject({ cycleDays: 14, reviewDay: 12, meetingDay: 14 });
    expect(p.pillars.map((x: { pillar: string }) => x.pillar)).toEqual([...TEMPLATE_PILLARS]);
    /* the Super Admin may set all five, and may promote a plan into the recipe book */
    expect(p.mayAssign).toEqual([...TEMPLATE_PILLARS]);
    expect(p.canSaveTemplate).toBe(true);

    const culture = pillarOf(p, 'culture');
    expect(culture.name).toBe('Nutrition');
    expect(culture.cls).toBe('p-culture');
    expect(culture.live.templateId).toBe('tp-nut-l2');
    expect(culture.ticket).toBeNull();
    expect(culture.hasDraft).toBe(false);
    expect(culture.view).toEqual(culture.live);
    /* Rajesh's seeded day-3 swap: modified, one edit, live and in view */
    expect(culture.modified).toBe(true);
    expect(culture.edits).toBe(1);
    expect(culture.stagedDays).toEqual([]);
    expect(culture.stagedKeys).toEqual([]);
    expect(Array.isArray(culture.log)).toBe(true);
    /* the referenced template rides along WITH its days, so the grid draws at once */
    expect(p.templates['tp-nut-l2']).toBeTruthy();
    expect(Object.keys(p.templates['tp-nut-l2'].days)).toHaveLength(14);
    expect(p.templates['tp-nut-l2'].desc).toContain('Level 2');
    expect(Array.isArray(p.derived)).toBe(true);
  });

  it('marks a pillar with no row as unassigned rather than leaving it out', async () => {
    /* motivation may or may not be seeded on this database; either way the
       shelf is answered, and an empty one reads as empty */
    const p = (await plan(anita)).body.data;
    const mot = pillarOf(p, 'motivation');
    expect(mot).toBeTruthy();
    expect(mot.name).toBe('Motivation');
    expect(mot.bookings).toEqual({});
  });

  it('is scope, not permission: the Doctor reads it and may set nothing', async () => {
    const res = await plan(kavya);
    expect(res.status).toBe(200);
    expect(res.body.data.mayAssign).toEqual([]);
    expect(res.body.data.canSaveTemplate).toBe(false);
    for (const p of res.body.data.pillars) expect(p.mayAssign).toBe(false);
  });

  it('answers a pillar coach their own pillar only', async () => {
    const res = await plan(lakshmi);
    expect(res.status).toBe(200);
    expect(res.body.data.mayAssign).toEqual(['yoga']);
    expect(pillarOf(res.body.data, 'yoga').mayAssign).toBe(true);
    expect(pillarOf(res.body.data, 'fitness').mayAssign).toBe(false);
  });
});

describe('GET /clients/:id/plan/:pillar/templates', () => {
  it('lists PUBLISHED templates only, marked against the shelf', async () => {
    const res = await api(anita).get(`/clients/${CLIENT}/plan/fitness/templates`);
    expect(res.status).toBe(200);
    const ids = res.body.data.templates.map((t: { id: string }) => t.id);
    expect(ids).toContain('tp-fit-l1');
    /* the seeded L3 moderate draft has not cleared the chain */
    expect(ids).not.toContain('tp-fit-l3m');
    const l1 = res.body.data.templates.find((t: { id: string }) => t.id === 'tp-fit-l1');
    /* Rajesh is level 3 in fitness on the sedentary track: right track, wrong level */
    expect(l1).toMatchObject({ onTrack: true, onLevel: false, onShelf: false, published: true });
    expect(res.body.data.level).toBe(3);
    expect(res.body.data.track).toBe('sedentary');
  });
});

/* ────────────────────────────────────────────────── call → stage → discard */

describe('PUT /clients/:id/plan/:pillar — Call a template', () => {
  it('stages the template on the ticket and leaves the live plan, and the client, untouched', async () => {
    const before = (await clientGet('/client/today')).body.data;

    const res = await api(anita).put(`/clients/${CLIENT}/plan/culture`, { templateId: 'tp-nut-l1' });
    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.pillar).toBe('culture');
    expect(b.hasDraft).toBe(true);
    expect(b.unpublished).toBe(false);
    expect(b.ticket.templateId).toBe('tp-nut-l1');
    expect(b.ticket.overrides).toEqual({});
    expect(b.ticket.by).toMatchObject({ id: 'u-anita' });
    /* the console reads the ticket … */
    expect(b.view.templateId).toBe('tp-nut-l1');
    expect(b.view.template.name).toContain('L1');
    /* … the live plan is what it was … */
    expect(b.live.templateId).toBe('tp-nut-l2');
    expect(Object.keys(b.live.overrides)).toEqual(['3']);
    /* … and a called template changes every day at once */
    expect(b.stagedDays).toHaveLength(14);
    expect(b.log.at(-1).act).toBe('Called Everyday plate — L1 Sedentary — draft');
    expect(b.templates['tp-nut-l1']).toBeTruthy();

    const after = (await clientGet('/client/today')).body.data;
    expect(after.meals).toEqual(before.meals);
  });

  it('refuses a template of another pillar, and a draft one', async () => {
    const wrong = await api(anita).put(`/clients/${CLIENT}/plan/culture`, { templateId: 'tp-fit-l1' });
    expect(wrong.status).toBe(400);
    const draft = await api(anita).put(`/clients/${CLIENT}/plan/fitness`, { templateId: 'tp-fit-l3m' });
    expect(draft.status).toBe(400);
    expect(draft.body.error.message).toMatch(/draft/);
  });

  it('DELETE …/draft discards the ticket and says so in the log; a second discard is 409', async () => {
    const res = await api(anita).del(`/clients/${CLIENT}/plan/culture/draft`);
    expect(res.status).toBe(200);
    expect(res.body.data.ticket).toBeNull();
    expect(res.body.data.hasDraft).toBe(false);
    expect(res.body.data.view.templateId).toBe('tp-nut-l2');
    expect(res.body.data.log.at(-1).act).toBe('Draft discarded');
    expect((await api(anita).del(`/clients/${CLIENT}/plan/culture/draft`)).status).toBe(409);
  });
});

/* ───────────────────────────────── edit a day → approve → the client reads it */

describe('a Nutrition day, edited on the record and read on the phone', () => {
  const DAY = 6; /* Rajesh's cycle-day today */

  it('PUT …/days/:day stages the day on the ticket, canonicalised, and the client still sees the plate as published', async () => {
    const res = await api(anita).put(`/clients/${CLIENT}/plan/culture/days/${DAY}`, {
      slots: [
        { label: 'Breakfast', time: '8:00', options: [['ci-oats'], [{ id: 'ci-idli', x: 2 }, 'ci-chutney']] },
        { label: 'Lunch', time: '13:00', options: [[{ id: 'ci-curdrice', x: 1 }]], dose: {} },
      ],
    });
    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.hasDraft).toBe(true);
    /* the ticket opened as a full copy of the live overrides — day 3 survives */
    expect(Object.keys(b.ticket.overrides).sort()).toEqual(['3', String(DAY)]);
    const staged = b.ticket.overrides[String(DAY)].slots;
    expect(staged).toHaveLength(2);
    /* ×1 is the bare id, ×2 stays an object, an empty dose is no dose */
    expect(staged[1].options).toEqual([['ci-curdrice']]);
    expect(staged[0].options[1]).toEqual([{ id: 'ci-idli', x: 2 }, 'ci-chutney']);
    expect(staged[1].dose).toBeUndefined();
    expect(b.stagedDays).toEqual([DAY]);
    expect(b.edits).toBe(2);
    expect(b.live.overrides[String(DAY)]).toBeUndefined();
    expect(b.log.at(-1).act).toBe(`Nutrition day ${DAY} edited — draft`);

    /* the phone reads the LIVE plan: three slots, as the template wrote them */
    const today = (await clientGet('/client/today')).body.data;
    expect(today.day).toBe(DAY);
    const planned = today.meals.filter((m: { planned: boolean }) => m.planned).map((m: { slot: string }) => m.slot);
    expect(planned).toEqual(['Breakfast', 'Lunch', 'Dinner']);
  });

  it('refuses an item from another library, and a film day with two films', async () => {
    const res = await api(anita).put(`/clients/${CLIENT}/plan/culture/days/${DAY}`, {
      slots: [{ label: 'Breakfast', options: [['ci-squat']] }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('ci-squat');

    /* one film a day: a second would have nothing to mean */
    const two = await api(anita).put(`/clients/${CLIENT}/plan/motivation/days/1`, {
      slots: [
        { label: 'Morning film', options: [['mv-sleep']] },
        { label: 'Second film', options: [['mv-breath']] },
      ],
    });
    expect([400, 409]).toContain(two.status);
  });

  it('refuses a day the template does not write, and free text where a clock belongs', async () => {
    /* the cycle is fourteen days; day 15 is off both the cycle and the template */
    const past = await api(anita).put(`/clients/${CLIENT}/plan/culture/days/15`, {
      slots: [{ label: 'Breakfast', options: [['ci-oats']] }],
    });
    expect(past.status).toBe(400);

    const words = await api(anita).put(`/clients/${CLIENT}/plan/culture/days/${DAY}`, {
      slots: [{ label: 'Breakfast', time: 'whenever you like', options: [['ci-oats']] }],
    });
    expect(words.status).toBe(400);
  });

  it('keeps a slot dose to the pillar own fields', async () => {
    const res = await api(anita).put(`/clients/${CLIENT}/plan/fitness/days/1`, {
      slots: [
        {
          label: 'Session',
          options: [['ci-squat']],
          /* `sets` is a fitness field; `kcal` is not, and RPE is capped at 10 */
          dose: { sets: 3, rpe: 99, kcal: 500 },
        },
      ],
    });
    expect(res.status).toBe(200);
    const staged = res.body.data.ticket.overrides['1'].slots[0].dose;
    expect(staged).toEqual({ sets: 3, rpe: 10 });

    await api(anita).del(`/clients/${CLIENT}/plan/fitness/draft`);
  });

  it('scopes every write to the row it read, so a lost race says so', async () => {
    /* Fitness, not the Nutrition ticket this block is walking — and discarded at
       the end, so the race leaves nothing behind for the next test to read */
    const [a, b] = await Promise.all([
      api(anita).put(`/clients/${CLIENT}/plan/fitness/days/1`, {
        slots: [{ label: 'Session', options: [['ci-squat']] }],
      }),
      api(anita).put(`/clients/${CLIENT}/plan/fitness/days/3`, {
        slots: [{ label: 'Session', options: [['ci-squat']] }],
      }),
    ]);
    /* each rebuilds the ticket from the row it read, so the second must either
       see the first or be refused — never quietly carry the first day away */
    for (const r of [a, b]) expect([200, 409]).toContain(r.status);
    const loser = [a, b].find((r) => r.status === 409);
    if (loser) {
      expect(loser.body.error.message).toMatch(/changed under you/);
    } else {
      const latest = (await api(anita).get(`/clients/${CLIENT}/plan`)).body.data;
      const fit = pillarOf(latest, 'fitness');
      expect(Object.keys(fit.ticket.overrides).sort()).toEqual(['1', '3']);
    }

    await api(anita).del(`/clients/${CLIENT}/plan/fitness/draft`);
  });

  it('POST …/publish copies the ticket onto the live plan — and the client app now lists the edited plate', async () => {
    const res = await api(anita).post(`/clients/${CLIENT}/plan/culture/publish`);
    expect(res.status).toBe(200);
    const b = res.body.data;
    expect(b.ticket).toBeNull();
    expect(b.hasDraft).toBe(false);
    expect(Object.keys(b.live.overrides).sort()).toEqual(['3', String(DAY)]);
    expect(b.live.overrides[String(DAY)].slots).toHaveLength(2);
    expect(b.view).toEqual(b.live);
    expect(b.modified).toBe(true);
    expect(b.log.at(-1).act).toBe('Approved Everyday plate — L2 Sedentary — published');

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'plan.published', subjectType: 'clientPlan', subjectId: CLIENT, actorId: 'u-anita' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
    expect(logged?.meta).toMatchObject({ pillar: 'culture', edits: 2 });

    /* THE PROMISE: the plate the phone draws is the plate the coach just approved */
    const today = (await clientGet('/client/today')).body.data;
    expect(today.day).toBe(DAY);
    const planned = today.meals.filter((m: { planned: boolean }) => m.planned);
    expect(planned.map((m: { slot: string }) => m.slot)).toEqual(['Breakfast', 'Lunch']);
    expect(planned[0].time).toBe('8:00');
  });

  it('publishing with nothing staged is 409', async () => {
    await api(anita).del(`/clients/${CLIENT}/plan/culture/draft`);
    expect((await api(anita).post(`/clients/${CLIENT}/plan/culture/publish`)).status).toBe(409);
  });

  it('approves an hour staged on a template the Catalog has since unpublished', async () => {
    /* the client is LIVE on this template; unpublishing it in the Catalog is the
       Catalog's business and must not freeze this client's own hour */
    const live = await prisma.clientPlan.findUniqueOrThrow({
      where: { clientId_pillar: { clientId: CLIENT, pillar: 'yoga' } },
    });
    const tplId = live.templateId as string;
    await prisma.planTemplate.update({ where: { id: tplId }, data: { published: false } });
    try {
      expect((await api(anita).patch(`/clients/${CLIENT}/plan/yoga`, { time: '07:15' })).status).toBe(200);
      const ok = await api(anita).post(`/clients/${CLIENT}/plan/yoga/publish`);
      expect(ok.status).toBe(200);
      expect(ok.body.data.live.time).toBe('07:15');

      /* a NEW template, though, has to have cleared the chain */
      const call = await api(anita).put(`/clients/${CLIENT}/plan/yoga`, { templateId: tplId });
      expect(call.status).toBe(400);
    } finally {
      await prisma.planTemplate.update({ where: { id: tplId }, data: { published: true } });
      await api(anita).del(`/clients/${CLIENT}/plan/yoga/draft`);
      await prisma.clientPlan.update({
        where: { clientId_pillar: { clientId: CLIENT, pillar: 'yoga' } },
        data: { time: live.time },
      });
    }
  });
});

/* ───────────────────────────────────────── the client's own hour, dose, targets */

describe('PATCH /clients/:id/plan/:pillar — time, dose, targets', () => {
  it('stages a session time, then a clear, each with the demo’s own log line', async () => {
    const set = await api(anita).patch(`/clients/${CLIENT}/plan/yoga`, { time: '06:30' });
    expect(set.status).toBe(200);
    expect(set.body.data.ticket.time).toBe('06:30');
    expect(set.body.data.view.time).toBe('06:30');
    expect(set.body.data.live.time).toBeNull();
    expect(set.body.data.stagedKeys).toEqual(['time']);
    expect(set.body.data.log.at(-1).act).toBe('Yoga moved to 6:30 am — draft');

    const clear = await api(anita).patch(`/clients/${CLIENT}/plan/yoga`, { time: '' });
    expect(clear.status).toBe(200);
    expect(clear.body.data.ticket.time).toBe('');
    expect(clear.body.data.view.time).toBeNull();
    /* '' against a live null is not a change — nothing is staged */
    expect(clear.body.data.stagedKeys).toEqual([]);
    expect(clear.body.data.log.at(-1).act).toBe('Yoga back on the template’s times — draft');

    await api(anita).del(`/clients/${CLIENT}/plan/yoga/draft`);
  });

  it('an approved hour moves the session clock the client reads', async () => {
    /* Rajesh's wind-down is seeded at 21:30 */
    const before = (await clientGet('/client/today')).body.data.sessions.find((s: { pillar: string }) => s.pillar === 'wellness');
    expect(before?.startMin).toBe(21 * 60 + 30);

    const set = await api(anita).patch(`/clients/${CLIENT}/plan/wellness`, { time: '20:00' });
    expect(set.status).toBe(200);
    expect(set.body.data.stagedKeys).toEqual(['time']);
    /* staged, not live: the phone still says 9:30 pm */
    const mid = (await clientGet('/client/today')).body.data.sessions.find((s: { pillar: string }) => s.pillar === 'wellness');
    expect(mid?.startMin).toBe(21 * 60 + 30);

    const pub = await api(anita).post(`/clients/${CLIENT}/plan/wellness/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.live.time).toBe('20:00');
    const after = (await clientGet('/client/today')).body.data.sessions.find((s: { pillar: string }) => s.pillar === 'wellness');
    expect(after?.startMin).toBe(20 * 60);
  });

  it('stages the client’s own dose over the plan’s, and hands it back', async () => {
    const set = await api(anita).patch(`/clients/${CLIENT}/plan/fitness`, { dose: { sets: 4, reps: 12, weight: '5 kg', rpe: 0 } });
    expect(set.status).toBe(200);
    /* a zero is "follow the plan" for that field, as the sheet reads its boxes */
    expect(set.body.data.ticket.dose).toEqual({ sets: 4, reps: 12, weight: '5 kg' });
    expect(set.body.data.view.dose).toEqual({ sets: 4, reps: 12, weight: '5 kg' });
    expect(set.body.data.stagedKeys).toEqual(['dose']);
    expect(set.body.data.log.at(-1).act).toBe('Fitness dose set for Rajesh — draft');

    const clear = await api(anita).patch(`/clients/${CLIENT}/plan/fitness`, { dose: null });
    expect(clear.body.data.ticket.dose).toBeNull();
    expect(clear.body.data.stagedKeys).toEqual([]);
    expect(clear.body.data.log.at(-1).act).toBe('Fitness dose back on the plan’s own — draft');

    await api(anita).del(`/clients/${CLIENT}/plan/fitness/draft`);
  });

  it('stages daily targets on Nutrition, and refuses them — and an hour — elsewhere', async () => {
    const set = await api(anita).patch(`/clients/${CLIENT}/plan/culture`, { targets: { kcal: 1650, protein: 95, fat: 0 } });
    expect(set.status).toBe(200);
    expect(set.body.data.ticket.targets).toEqual({ kcal: 1650, protein: 95 });
    expect(set.body.data.stagedKeys).toEqual(['targets']);
    expect(set.body.data.log.at(-1).act).toBe('Daily targets staged');

    const clear = await api(anita).patch(`/clients/${CLIENT}/plan/culture`, { targets: null });
    expect(clear.body.data.ticket.targets).toBeNull();
    expect(clear.body.data.log.at(-1).act).toBe('Daily targets cleared — draft');
    await api(anita).del(`/clients/${CLIENT}/plan/culture/draft`);

    expect((await api(anita).patch(`/clients/${CLIENT}/plan/fitness`, { targets: { kcal: 1800 } })).status).toBe(400);
    expect((await api(anita).patch(`/clients/${CLIENT}/plan/culture`, { time: '07:00' })).status).toBe(400);
    /* nothing to say is not a request */
    expect((await api(anita).patch(`/clients/${CLIENT}/plan/culture`, {})).status).toBe(400);
  });
});

/* ───────────────────────────────────────────────────────────── the gate */

describe('who may set what', () => {
  it('a Yoga Coach edits yoga and is refused fitness, with the refusal recorded', async () => {
    const mine = await api(lakshmi).patch(`/clients/${CLIENT}/plan/yoga`, { time: '07:00' });
    expect(mine.status).toBe(200);
    await api(lakshmi).del(`/clients/${CLIENT}/plan/yoga/draft`);

    const since = new Date();
    const theirs = await api(lakshmi).put(`/clients/${CLIENT}/plan/fitness`, { templateId: 'tp-fit-l1' });
    expect(theirs.status).toBe(403);
    expect(theirs.body.error.message).toBe('Not available for your role.');
    const logged = await prisma.auditLog.findFirst({
      where: { action: 'denied', subjectType: 'clientPlan', subjectId: CLIENT, actorId: 'u-lakshmi', at: { gte: since } },
    });
    expect(logged).not.toBeNull();
    expect(logged?.meta).toMatchObject({ pillar: 'fitness' });
  });

  it('the Doctor cannot write, and motivation is Ops’ alone', async () => {
    expect((await api(kavya).put(`/clients/${CLIENT}/plan/culture`, { templateId: 'tp-nut-l2' })).status).toBe(403);
    expect((await api(kavya).post(`/clients/${CLIENT}/plan/culture/publish`)).status).toBe(403);
    /* Vikram owns fitness, not the film library */
    expect((await api(vikram).put(`/clients/${CLIENT}/plan/motivation`, { templateId: 'tp-mot-l1' })).status).toBe(403);
  });

  it('a client outside the caller’s scope is 404, never 403', async () => {
    /* Ananya has no pod — Lakshmi cannot see her at all */
    expect((await api(lakshmi).get('/clients/c-ananya/plan')).status).toBe(404);
  });
});

/* ────────────────────────────────────────────────────────── ask AI to fit */

describe('POST /clients/:id/plan/:pillar/fit', () => {
  it('picks the client’s own shelf when a published template sits on it', async () => {
    const res = await api(anita).post(`/clients/${CLIENT}/plan/culture/fit`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ templateId: 'tp-nut-l2', onShelf: true });
    expect(res.body.data.text).toBe(
      'Sedentary, Nutrition level 2 — Everyday plate — L2 Sedentary sits on exactly that shelf, ' +
        'and Rajesh’s coach can still edit any day on top of it. Confirm to assign.',
    );
  });

  it('falls to the nearest published fit when the shelf is empty', async () => {
    /* Rajesh is level 3 in yoga; only the L1 template is published */
    const res = await api(anita).post(`/clients/${CLIENT}/plan/yoga/fit`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ templateId: 'tp-yog-l1', onShelf: false });
    expect(res.body.data.text).toContain('is the nearest published fit');
  });
});

/* ──────────────────────────────────────────────────── save as new template */

describe('POST /clients/:id/plan/:pillar/save-template', () => {
  it('promotes the live plan, overrides baked in, into a draft that remembers the client', async () => {
    const res = await api(anita).post(`/clients/${CLIENT}/plan/culture/save-template`, { name: 'Everyday plate · Rajesh' });
    expect(res.status).toBe(201);
    const made = res.body.data;
    expect(made).toMatchObject({ name: 'Everyday plate · Rajesh', pillar: 'culture', level: 2, track: 'sedentary', published: false });
    expect(made.desc).toBe('Adapted from Everyday plate — L2 Sedentary for Rajesh D.');

    const row = await prisma.planTemplate.findUnique({ where: { id: made.id } });
    expect(row?.forClientId).toBe(CLIENT);
    expect(row?.createdById).toBe('u-anita');
    const days = row?.days as Record<string, { slots: unknown[] }>;
    /* the seeded day-3 swap and the day approved above are baked into ordinary days */
    expect(days['3']?.slots).toHaveLength(3);
    expect(days['6']?.slots).toHaveLength(2);
    expect(Object.keys(days)).toHaveLength(14);

    /* and the record lists it under "Saved from this plan", unsent */
    const p = (await plan(anita)).body.data;
    const derived = p.derived.find((d: { id: string }) => d.id === made.id);
    expect(derived).toMatchObject({ pillar: 'culture', published: false, approval: null });

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'catalog.template_created', subjectId: made.id },
    });
    expect(logged?.meta).toMatchObject({ from: 'tp-nut-l2', client: 'Rajesh D.' });
  });

  it('is authoring: a pillar coach without editTemplates is refused', async () => {
    expect((await api(vikram).post(`/clients/${CLIENT}/plan/fitness/save-template`, { name: 'x' })).status).toBe(403);
  });
});

/* ─────────────────────────────────────────────────────── the morning film */

describe('GET /client/today — film', () => {
  it('names the film the live Motivation plan prescribes for the day, and nothing when none is live', async () => {
    const had = await prisma.clientPlan.findUnique({ where: { clientId_pillar: { clientId: CLIENT, pillar: 'motivation' } } });
    await prisma.clientPlan.upsert({
      where: { clientId_pillar: { clientId: CLIENT, pillar: 'motivation' } },
      create: { clientId: CLIENT, pillar: 'motivation', templateId: 'tp-mot-l1', overrides: {}, log: [] },
      update: { templateId: 'tp-mot-l1' },
    });
    try {
      const withPlan = (await clientGet('/client/today')).body.data;
      /* Opening films — day 6 is the sleep film */
      expect(withPlan.film).toMatchObject({ id: 'mv-sleep' });
      expect(typeof withPlan.film.name).toBe('string');
      expect('url' in withPlan.film).toBe(true);

      /*
       * A LINK THE PHONE CAN OPEN, OR NONE.
       *
       * The library takes what the demo's `ytId` takes — a bare id as readily as
       * a watch URL — and a file path only the demo's own server could serve.
       * `Linking.openURL` needs a scheme, so a YouTube reference becomes its
       * watch URL and anything else is null: the mark stays inert rather than
       * promising a film that will not open.
       */
      const film = await prisma.catalogItem.findUniqueOrThrow({ where: { id: 'mv-sleep' } });
      const body = (film.body ?? {}) as Record<string, unknown>;
      const setMedia = (media: unknown) =>
        prisma.catalogItem.update({
          where: { id: 'mv-sleep' },
          data: { body: { ...body, media } as Prisma.InputJsonValue },
        });
      try {
        await setMedia({ kind: 'youtube', ref: 'dQw4w9WgXcQ' });
        expect((await clientGet('/client/today')).body.data.film.url).toBe(
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        );

        await setMedia({ video: 'https://youtu.be/dQw4w9WgXcQ' });
        expect((await clientGet('/client/today')).body.data.film.url).toBe(
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        );

        /* a relative path is nowhere the phone can go */
        await setMedia({ video: 'media/welcome.mp4' });
        expect((await clientGet('/client/today')).body.data.film.url).toBeNull();

        await setMedia({ video: 'https://vimeo.com/12345' });
        expect((await clientGet('/client/today')).body.data.film.url).toBe('https://vimeo.com/12345');
      } finally {
        await prisma.catalogItem.update({
          where: { id: 'mv-sleep' },
          data: { body: film.body as Prisma.InputJsonValue },
        });
      }

      await prisma.clientPlan.update({
        where: { clientId_pillar: { clientId: CLIENT, pillar: 'motivation' } },
        data: { templateId: null },
      });
      const without = (await clientGet('/client/today')).body.data;
      expect(without.film).toBeNull();
    } finally {
      if (had) {
        await prisma.clientPlan.update({
          where: { clientId_pillar: { clientId: CLIENT, pillar: 'motivation' } },
          data: { templateId: had.templateId },
        });
      } else {
        await prisma.clientPlan.delete({ where: { clientId_pillar: { clientId: CLIENT, pillar: 'motivation' } } });
      }
    }
  });
});
