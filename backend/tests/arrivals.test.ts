import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { FLOW_VERSION, healTicks, stepDef, tickKey } from '@haalving/shared';

import { Prisma } from '@prisma/client';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * Onboarding, exercised through the API.
 *
 * Asserted against the SEEDED arrivals — Arun on step 1, Divya on 3, Kiran on 5
 * with 3 of 10, Nisha on 8, Rahul on 12 with 2 of 4 — so a failure means the
 * product's behaviour changed rather than a fixture drifting.
 */

const here = dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(readFileSync(join(here, '../prisma/demo-seed.json'), 'utf8')) as {
  pipeline: Array<{
    id: string;
    name: string;
    step: string;
    ticks: Record<string, boolean>;
    note: string;
    plan: string;
    mins?: number;
  }>;
  capacity: Array<{ staffId: string; load: number; cap: number; roleLabel: string }>;
};

const SEEDED = demo.pipeline.map((p) => p.id);

let anita: Session; /* Super Admin — seeAllClients, allocate, overrideCapacity */
let vikram: Session; /* Fitness Coach — none of the three: the coach lens */
let sneha: Session; /* Dietician — also no allocate, and no overrideCapacity */

/**
 * Put the five arrivals back exactly where the seed leaves them.
 *
 * These tests promote, allocate and untick, all of which are destructive in ways
 * that reach outside the arrivals table — a promotion mints a User, a Client, its
 * pod seats and two circle messages, and moves a coach's load. Restoring only the
 * arrival would leave the next run asserting against a bench that had drifted.
 */
async function resetArrivals(): Promise<void> {
  /* anything a test created, and any client a test minted */
  const extra = await prisma.arrival.findMany({
    where: { id: { notIn: SEEDED } },
    select: { id: true, promotedClientId: true },
  });
  const promoted = await prisma.arrival.findMany({
    where: { promotedClientId: { not: null } },
    select: { promotedClientId: true },
  });

  const clientIds = [...extra, ...promoted]
    .map((r) => r.promotedClientId)
    .filter((v): v is string => !!v);

  await prisma.arrival.deleteMany({ where: { id: { notIn: SEEDED } } });

  for (const cid of clientIds) {
    const c = await prisma.client.findUnique({ where: { id: cid }, select: { userId: true } });
    /* PodSeat, CircleMessage and the arrival's FK all cascade or null out from
       here; the login is a separate row and has to go with it */
    await prisma.client.delete({ where: { id: cid } }).catch(() => undefined);
    if (c?.userId) await prisma.user.delete({ where: { id: c.userId } }).catch(() => undefined);
  }

  await prisma.arrivalEvent.deleteMany({});

  const now = Date.now();
  for (const card of demo.pipeline) {
    const { ticks, seen } = healTicks(card.step, card.ticks ?? {});
    await prisma.arrival.update({
      where: { id: card.id },
      data: {
        name: card.name,
        plan: (card.plan === 'svayam' ? 'SVAYAM' : 'POORNA') as never,
        note: card.note,
        arrivedAt: new Date(now - (card.mins ?? 0) * 60_000),
        step: card.step,
        ticks,
        healed: seen,
        flowVersion: FLOW_VERSION,
        podSeats: {},
        inbody: Prisma.DbNull,
        welcomedAt: null,
        welcomeText: null,
        status: 'ACTIVE' as never,
        promotedClientId: null,
      },
    });
  }

  /* the bench, back to the demo's declared numbers — Vikram 50 of 50 and FULL */
  for (const row of demo.capacity) {
    await prisma.capacity.update({
      where: { staffId: row.staffId },
      data: { declared: row.cap, load: row.load },
    });
  }
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram, sneha] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('sneha'),
  ]);
});

afterAll(async () => {
  await resetArrivals();
  await closeConnections();
});

beforeEach(resetArrivals);

const api = (s: Session) => ({
  list: () => request(app).get('/api/v1/arrivals').set(...auth(s.accessToken)),
  get: (id: string) => request(app).get(`/api/v1/arrivals/${id}`).set(...auth(s.accessToken)),
  post: (path: string, body?: object) =>
    request(app)
      .post(`/api/v1/arrivals${path}`)
      .set(...auth(s.accessToken))
      .send(body ?? {}),
  patch: (id: string, body: object) =>
    request(app)
      .patch(`/api/v1/arrivals/${id}`)
      .set(...auth(s.accessToken))
      .send(body),
});

/** Tick every task of the step an arrival stands on. */
async function completeCurrentStep(s: Session, id: string): Promise<void> {
  const rec = await api(s).get(id);
  const step: string = rec.body.data.step;
  const n = stepDef(step).tasks.length;
  for (let i = 0; i < n; i++) {
    await api(s).post(`/${id}/ticks`, { stepKey: step, taskIndex: i, on: true });
  }
}

/* ─────────────────────────────────────────────────────────── the rail */

describe('GET /arrivals', () => {
  it('gives a runner all five, furthest along first', async () => {
    const res = await api(anita).list();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data.map((r: { name: string }) => r.name)).toEqual([
      'Rahul V.',
      'Nisha T.',
      'Kiran R.',
      'Divya S.',
      'Arun M.',
    ]);
  });

  it('reads Kiran the way the rail draws him — step 5 of 12, 3 of 10 done', async () => {
    const res = await api(anita).list();
    const kiran = res.body.data.find((r: { name: string }) => r.name === 'Kiran R.');
    expect(kiran).toMatchObject({
      stepIndex: 4,
      stepLabel: 'Immediately after',
      stepPhase: 'Assessment meeting',
      ticked: 3,
      taskCount: 10,
      openItem: false,
    });
  });

  it('shows a coach nothing until he is seated on one', async () => {
    expect((await api(vikram).list()).body.data).toHaveLength(0);

    /* Vikram is 50 of 50 in the demo, so seating him takes the override — which
       is the only way to give the lens something to see without changing the
       bench the other tests assert against */
    await api(anita).post('/p3/allocate', {
      seats: { fitness: 'u-vikram' },
      override: { staffId: 'u-vikram', reason: 'lens fixture' },
    });

    const after = await api(vikram).list();
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0].name).toBe('Kiran R.');
  });

  it('404s a coach who opens an arrival he is not seated on', async () => {
    /* 404 rather than 403, exactly as /clients does — a 403 would confirm the
       record exists, which is itself the sensitive fact */
    expect((await api(vikram).get('p3')).status).toBe(404);
  });
});

/* ─────────────────────────────────────────────────────── the coach lens */

describe('who may run the flow', () => {
  it('refuses a coach a tick, and records the refusal in both places', async () => {
    const res = await api(vikram).post('/p3/ticks', {
      stepKey: 'assessafter',
      taskIndex: 4,
      on: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(
      'Ticking a task needs the allocate permission. This attempt was logged.',
    );

    const denied = await prisma.arrivalEvent.findMany({
      where: { arrivalId: 'p3', kind: 'DENIED' },
    });
    expect(denied).toHaveLength(1);
    expect(denied[0]!.byId).toBe('u-vikram');

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'arrival.denied', subjectId: 'p3', actorId: 'u-vikram' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
  });

  it('leaves the record untouched when it refuses', async () => {
    await api(vikram).post('/p3/ticks', { stepKey: 'assessafter', taskIndex: 4, on: true });
    const a = await prisma.arrival.findUnique({ where: { id: 'p3' } });
    expect((a!.ticks as Record<string, boolean>)[tickKey('assessafter', 4)]).toBeUndefined();
  });

  it('refuses a coach every other run verb too', async () => {
    for (const [path, body] of [
      ['/p3/close-step', {}],
      ['/p3/step-back', {}],
      ['/p3/allocate', { seats: { fitness: 'u-vikram' } }],
      ['/p3/welcome', { text: 'hello' }],
      ['/p5/promote', {}],
    ] as const) {
      expect((await api(vikram).post(path, body)).status).toBe(403);
    }
  });
});

/* ──────────────────────────────────────────────────────── sequential */

describe('ticks are sequential', () => {
  it('refuses a tick on a later step with a 409', async () => {
    const res = await api(anita).post('/p3/ticks', { stepKey: 'obs1', taskIndex: 0, on: true });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/has not been reached yet/);
  });

  it('takes a tick on the current step', async () => {
    const res = await api(anita).post('/p3/ticks', {
      stepKey: 'assessafter',
      taskIndex: 4,
      on: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.ticked).toBe(4);
    expect(res.body.data.stepComplete).toBe(false);
  });

  it('refuses a task index the step does not have, at the edge', async () => {
    /* 400 from the edge, not 409 from the service: the step exists and is open,
       the TASK does not — "never", not "not now" */
    const res = await api(anita).post('/p3/ticks', {
      stepKey: 'assessafter',
      taskIndex: 99,
      on: true,
    });
    expect(res.status).toBe(400);
  });
});

describe('a step closes only when every task is ticked', () => {
  it('refuses to close with tasks left', async () => {
    const res = await api(anita).post('/p3/close-step');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('7 tasks left in step 5.');
  });

  it('closes once the last one lands, and opens the next step', async () => {
    await completeCurrentStep(anita, 'p3');
    const res = await api(anita).post('/p3/close-step');
    expect(res.status).toBe(200);
    expect(res.body.data.step).toBe('obs1');
    expect(res.body.data.stepIndex).toBe(5);

    const ev = await prisma.arrivalEvent.findFirst({
      where: { arrivalId: 'p3', kind: 'CLOSE_STEP' },
    });
    expect(ev!.stepKey).toBe('assessafter');
  });

  it('refuses to close the last step — that is promotion, a different verb', async () => {
    await completeCurrentStep(anita, 'p5');
    const res = await api(anita).post('/p5/close-step');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/finishes by moving to Onboarded/);
  });
});

describe('step back', () => {
  it('re-opens the previous step with its ticks intact', async () => {
    await completeCurrentStep(anita, 'p3');
    await api(anita).post('/p3/close-step');
    expect((await api(anita).get('p3')).body.data.step).toBe('obs1');

    const back = await api(anita).post('/p3/step-back');
    expect(back.status).toBe(200);
    expect(back.body.data.step).toBe('assessafter');
    /* all ten still ticked — the step WAS completed, and pretending otherwise
       would lose work */
    expect(back.body.data.ticked).toBe(10);
    expect(back.body.data.stepComplete).toBe(true);
  });

  it('refuses on the first step', async () => {
    const res = await api(anita).post('/p1/step-back');
    expect(res.status).toBe(409);
  });
});

/* ────────────────────────────────────────────────────── the open item */

describe('a closed step can be corrected, and the hole blocks everything', () => {
  it('untick behind the current step opens a gap and blocks the close', async () => {
    const un = await api(anita).post('/p3/ticks', {
      stepKey: 'assessprep',
      taskIndex: 0,
      on: false,
    });
    expect(un.status).toBe(200);
    /* assessprep is index 2 — step 3 in the crumbs */
    expect(un.body.data.firstGap).toBe(2);
    expect(un.body.data.openItem).toBe(true);

    const head = await api(anita).get('p3');
    expect(head.body.data.openItem).toBe(true);

    /* even with the current step finished, the hole behind it refuses the close */
    await completeCurrentStep(anita, 'p3');
    const close = await api(anita).post('/p3/close-step');
    expect(close.status).toBe(409);
    expect(close.body.error.message).toMatch(/Step 3 · Prep has an open item/);
  });

  it('records the moment the hole appeared, and who made it', async () => {
    await api(anita).post('/p3/ticks', { stepKey: 'assessprep', taskIndex: 0, on: false });
    const ev = await prisma.arrivalEvent.findFirst({
      where: { arrivalId: 'p3', kind: 'FIX_OPENED' },
    });
    expect(ev).not.toBeNull();
    expect(ev!.stepKey).toBe('assessprep');
    expect(ev!.byId).toBe('u-anita');
  });

  it('re-ticking clears it', async () => {
    await api(anita).post('/p3/ticks', { stepKey: 'assessprep', taskIndex: 0, on: false });
    const re = await api(anita).post('/p3/ticks', {
      stepKey: 'assessprep',
      taskIndex: 0,
      on: true,
    });
    expect(re.body.data.firstGap).toBe(-1);
    expect(re.body.data.openItem).toBe(false);
  });
});

/* ──────────────────────────────────────────────────────── the capacity */

describe('team allocation and capacity', () => {
  it('refuses a full bench with 409 CAPACITY_FULL, naming the person', async () => {
    /* Vikram is 50 of 50 in the demo, deliberately */
    const res = await api(anita).post('/p1/allocate', { seats: { fitness: 'u-vikram' } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAPACITY_FULL');
    expect(res.body.error.message).toMatch(/Vikram/);
    expect(res.body.error.message).toMatch(/Full — Ops Head override required, reason logged\./);
  });

  it('seats nobody when one seat in the body is full', async () => {
    const res = await api(anita).post('/p1/allocate', {
      seats: { fitness: 'u-vikram', yoga: 'u-lakshmi' },
    });
    expect(res.status).toBe(409);
    /* a partial allocation is worse than a refusal: it looks like it worked */
    const a = await prisma.arrival.findUnique({ where: { id: 'p1' } });
    expect(a!.podSeats).toEqual({});
  });

  it('takes an override from a holder of overrideCapacity, raises the cap and logs the reason', async () => {
    const res = await api(anita).post('/p1/allocate', {
      seats: { fitness: 'u-vikram' },
      override: { staffId: 'u-vikram', reason: 'Kiran is his existing client’s spouse' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.podSeats).toEqual({ fitness: 'u-vikram' });

    const cap = await prisma.capacity.findUnique({ where: { staffId: 'u-vikram' } });
    expect(cap!.declared).toBe(55);
    /* the LOAD does not move here — that happens at promotion, when a real
       client is seated */
    expect(cap!.load).toBe(50);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'capacity.override', subjectId: 'u-vikram' },
      orderBy: { at: 'desc' },
    });
    expect(log!.reason).toBe('Kiran is his existing client’s spouse');
  });

  it('refuses an override from someone without the permission', async () => {
    /* Sneha can neither run the flow nor override, so the run gate answers
       first — the point is that she cannot get through either way */
    const res = await api(sneha).post('/p1/allocate', {
      seats: { fitness: 'u-vikram' },
      override: { staffId: 'u-vikram', reason: 'because' },
    });
    expect(res.status).toBe(403);
  });

  it('refuses an empty reason at the edge', async () => {
    const res = await api(anita).post('/p1/allocate', {
      seats: { fitness: 'u-vikram' },
      override: { staffId: 'u-vikram', reason: '  ' },
    });
    expect(res.status).toBe(400);
  });

  it('ticks the capacity task, because doing the work is ticking it', async () => {
    await api(anita).post('/p1/allocate', { seats: { yoga: 'u-lakshmi' } });
    const a = await prisma.arrival.findUnique({ where: { id: 'p1' } });
    /* the `capacity` act sits on team#0 */
    expect((a!.ticks as Record<string, boolean>)[tickKey('team', 0)]).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────── the other acts */

describe('the InBody and the welcome', () => {
  it('stores the key-in, stamps who keyed it, and ticks its task', async () => {
    const res = await api(anita).post('/p1/inbody', {
      weightKg: 78.4,
      heightCm: 174,
      bodyFatPct: 28.1,
      skeletalMuscleKg: 29.6,
      visceralFat: 11,
    });
    expect(res.status).toBe(200);
    const a = await prisma.arrival.findUnique({ where: { id: 'p1' } });
    const body = a!.inbody as Record<string, unknown>;
    expect(body.weightKg).toBe(78.4);
    expect(body.keyedById).toBe('u-anita');
    expect((a!.ticks as Record<string, boolean>)[tickKey('team', 2)]).toBe(true);
  });

  it('refuses a height that is not a human one', async () => {
    const res = await api(anita).post('/p1/inbody', {
      weightKg: 78,
      heightCm: 1740,
      bodyFatPct: 28,
      skeletalMuscleKg: 29,
      visceralFat: 11,
    });
    expect(res.status).toBe(400);
  });

  it('records the welcome without posting anything, because there is no room yet', async () => {
    const before = await prisma.circleMessage.count();
    const res = await api(anita).post('/p3/welcome', { text: 'Welcome aboard, Kiran.' });
    expect(res.status).toBe(200);
    expect(await prisma.circleMessage.count()).toBe(before);

    const a = await prisma.arrival.findUnique({ where: { id: 'p3' } });
    expect(a!.welcomeText).toBe('Welcome aboard, Kiran.');
    expect(a!.welcomedAt).not.toBeNull();
    /* the `welcome` act sits on assessafter#1 */
    expect((a!.ticks as Record<string, boolean>)[tickKey('assessafter', 1)]).toBe(true);
  });
});

/* ───────────────────────────────────────────────────────── promotion */

describe('POST /arrivals/:id/promote', () => {
  it('refuses while the last step is unfinished', async () => {
    const res = await api(anita).post('/p5/promote');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Every step of the SOP has to be closed first/);
  });

  it('refuses when a step behind has an open item, even on step 12 complete', async () => {
    await completeCurrentStep(anita, 'p5');
    await api(anita).post('/p5/ticks', { stepKey: 'assessprep', taskIndex: 0, on: false });
    const res = await api(anita).post('/p5/promote');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Step 3 · Prep has an open item/);
  });

  it('mints a day-one client that has nobody else’s readings', async () => {
    await api(anita).post('/p5/allocate', { seats: { yoga: 'u-lakshmi', mind: 'u-meera' } });
    await api(anita).post('/p5/welcome', { text: 'Welcome aboard, Rahul.' });
    await completeCurrentStep(anita, 'p5');

    const res = await api(anita).post('/p5/promote');
    expect(res.status).toBe(201);
    const clientId: string = res.body.data.clientId;

    const c = await prisma.client.findUnique({
      where: { id: clientId },
      include: { pod: true, user: true },
    });

    expect(c!.name).toBe('Rahul V.');
    expect(c!.cycle).toBe(1);
    expect(c!.cycleDay).toBe(1);
    expect(c!.observation).toBe(true);
    expect(c!.levels).toEqual({ fitness: 1, culture: 1, yoga: 1, wellness: 1 });
    /* THE ZERO STATE — nothing measured, and null is not a measured zero */
    expect(c!.risk).toBeNull();
    expect(c!.riskWhy).toBe('observation day 1 of 5 — assessment awaited');
    expect(c!.compliance).toBeNull();
    for (const s of Object.values(c!.sessions as Record<string, { done: number }>)) {
      expect(s.done).toBe(0);
    }
    /* Poorna carries all four pillars by definition */
    expect([...c!.humanPillars].sort()).toEqual(['culture', 'fitness', 'wellness', 'yoga']);
    /* and a login, so OTP works later */
    expect(c!.user!.role).toBe('client');
  });

  it('seats the pod it allocated and moves the load', async () => {
    const before = await prisma.capacity.findUnique({ where: { staffId: 'u-lakshmi' } });

    await api(anita).post('/p5/allocate', { seats: { yoga: 'u-lakshmi', mind: 'u-meera' } });
    await completeCurrentStep(anita, 'p5');
    const res = await api(anita).post('/p5/promote');

    const seats = await prisma.podSeat.findMany({ where: { clientId: res.body.data.clientId } });
    expect(seats.map((s) => `${s.seat}:${s.staffId}`).sort()).toEqual([
      'mind:u-meera',
      'yoga:u-lakshmi',
    ]);

    const after = await prisma.capacity.findUnique({ where: { staffId: 'u-lakshmi' } });
    expect(after!.load).toBe(before!.load + 1);
  });

  it('pins the welcome card, then the reviewed welcome, in that order', async () => {
    await api(anita).post('/p5/welcome', { text: 'Welcome aboard, Rahul.' });
    await completeCurrentStep(anita, 'p5');
    const res = await api(anita).post('/p5/promote');

    const msgs = await prisma.circleMessage.findMany({
      where: { clientId: res.body.data.clientId },
      orderBy: { seq: 'asc' },
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.kind).toBe('CARD');
    expect(msgs[0]!.text).toBe('Pinned: Welcome to HAALVING · How we’ll work together');
    expect(msgs[0]!.seq).toBe(1);
    expect(msgs[1]!.text).toBe('Welcome aboard, Rahul.');
    expect(msgs[1]!.seq).toBe(2);
  });

  it('posts only the pinned card when no welcome was reviewed', async () => {
    await completeCurrentStep(anita, 'p5');
    const res = await api(anita).post('/p5/promote');
    const msgs = await prisma.circleMessage.findMany({
      where: { clientId: res.body.data.clientId },
    });
    expect(msgs).toHaveLength(1);
  });

  it('moves the person from one list to the other', async () => {
    await completeCurrentStep(anita, 'p5');
    const res = await api(anita).post('/p5/promote');

    const rail = await api(anita).list();
    expect(rail.body.data).toHaveLength(4);
    expect(rail.body.data.map((r: { name: string }) => r.name)).not.toContain('Rahul V.');

    const clients = await request(app)
      .get('/api/v1/clients')
      .set(...auth(anita.accessToken));
    expect(clients.body.data.some((c: { id: string }) => c.id === res.body.data.clientId)).toBe(
      true,
    );

    const a = await prisma.arrival.findUnique({ where: { id: 'p5' } });
    expect(a!.status).toBe('PROMOTED');
    expect(a!.promotedClientId).toBe(res.body.data.clientId);
  });

  it('refuses a second promotion', async () => {
    await completeCurrentStep(anita, 'p5');
    await api(anita).post('/p5/promote');
    const again = await api(anita).post('/p5/promote');
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already been onboarded/);
  });

  it('writes the audit row with both ids', async () => {
    await completeCurrentStep(anita, 'p5');
    const res = await api(anita).post('/p5/promote');
    const log = await prisma.auditLog.findFirst({
      where: { action: 'arrival.promoted', subjectId: 'p5' },
      orderBy: { at: 'desc' },
    });
    expect(log).not.toBeNull();
    expect((log!.meta as { clientId: string }).clientId).toBe(res.body.data.clientId);
  });
});

/* ─────────────────────────────────────────────────────── registration */

describe('POST /arrivals', () => {
  it('registers an arrival on step 1 with the current SOP stamped on it', async () => {
    const res = await api(anita).post('', {
      name: 'Test Person',
      plan: 'poorna',
      source: 'sales',
      note: 'walked in',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.step).toBe('records');
    expect(res.body.data.stepIndex).toBe(0);

    const a = await prisma.arrival.findUnique({ where: { id: res.body.data.id } });
    expect(a!.flowVersion).toBe(FLOW_VERSION);
    expect(a!.ticks).toEqual({});
  });

  it('refuses a plan that is not on sale', async () => {
    const res = await api(anita).post('', {
      name: 'Test Person',
      plan: 'svayam',
      source: 'sales',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not on sale/);
  });

  it('refuses a coach', async () => {
    const res = await api(vikram).post('', {
      name: 'Test Person',
      plan: 'poorna',
      source: 'sales',
    });
    expect(res.status).toBe(403);
  });
});
