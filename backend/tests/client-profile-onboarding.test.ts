import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { FLOW_VERSION } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp } from './helpers.js';

/**
 * A PERSON STILL ONBOARDING CAN REACH THEIR PROFILE — and so the way out.
 *
 * Before promotion there is no Client row, and `/client/profile` used to answer
 * 404, which left the app's Profile screen on an error banner with the Sign
 * out button behind it. Now it answers the profile such a person has: name and
 * plan, the step they stand on, the people running their onboarding as the
 * circle, and nothing invented.
 */

const PHONE = '+919000000771';
let token: string;
let userId: string;
let arrivalId: string;

beforeAll(async () => {
  await clearRateLimits();
  const u = await prisma.user.create({
    data: { role: 'client', name: 'Ported acceptance — still onboarding', phone: PHONE, status: 'active' },
    select: { id: true },
  });
  userId = u.id;
  const a = await prisma.arrival.create({
    data: {
      name: 'Ported acceptance — still onboarding',
      phone: PHONE,
      plan: 'POORNA',
      step: 'records',
      ticks: {},
      healed: {},
      flowVersion: FLOW_VERSION,
      podSeats: {},
      status: 'ACTIVE' as never,
    },
    select: { id: true },
  });
  arrivalId = a.id;

  await issueTestOtp(PHONE, '123456');
  const res = await request(app)
    .post('/api/v1/auth/client/otp/verify')
    .set('X-Client', 'mobile')
    .send({ phone: PHONE, code: '123456' });
  expect(res.status, 'otp verify').toBe(200);
  token = res.body.data.accessToken as string;
});

afterAll(async () => {
  await prisma.arrivalMessage.deleteMany({ where: { arrivalId } });
  await prisma.arrival.delete({ where: { id: arrivalId } });
  await prisma.otp.deleteMany({ where: { phone: PHONE } });
  await prisma.user.delete({ where: { id: userId } });
  await closeConnections();
});

const get = (path: string) => request(app).get(`/api/v1${path}`).set(...auth(token));

describe('GET /client/profile while onboarding', () => {
  it('is the pending state on /client/me', async () => {
    const me = await get('/client/me');
    expect(me.status).toBe(200);
    expect(me.body.data.onboarded).toBe(false);
  });

  it('answers 200 with the step, the circle and nothing invented', async () => {
    const res = await get('/client/profile');
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(p.id).toBeNull();
    expect(p.name).toBe('Ported acceptance — still onboarding');
    expect(p.plan).toBe('POORNA');
    expect(p.onboarding).toMatchObject({ step: 1, total: 12 });
    expect(p.cycle).toBe(0);
    expect(p.levels).toEqual({});
    expect(p.records).toEqual([]);
    expect(p.pillars).toEqual(['fitness', 'culture', 'yoga', 'wellness']);
    /* the desk running onboarding is the circle until the pod is seated */
    expect(Array.isArray(p.pod)).toBe(true);
    expect(p.pod.length).toBeGreaterThan(0);
  });

  it('reads the rail, what was told and what was measured back — placeholders as nulls, never samples', async () => {
    /* the person's own deck answers, as the app writes them */
    await prisma.arrival.update({
      where: { id: arrivalId },
      data: {
        intake: { goals: ['Sleep better', 'Lose 4 kg'], conditions: ['PCOD'], fitness: 'beginner', track: 'sedentary' },
        inbody: { heightCm: 162, weightKg: 71.5, source: 'self' },
        note: 'Feel light in the mornings',
      },
    });
    const ob = (await get('/client/profile')).body.data.onboarding;
    expect(ob.steps).toHaveLength(12);
    expect(ob.steps[0]).toMatchObject({ n: 1, label: 'Health records', state: 'now' });
    expect(ob.steps[1].state).toBe('next');
    expect(ob.told).toEqual({
      goals: ['Sleep better', 'Lose 4 kg'],
      conditions: ['PCOD'],
      fitness: 'beginner',
      track: 'sedentary',
      note: 'Feel light in the mornings',
    });
    expect(ob.measured).toEqual({ heightCm: 162, weightKg: 71.5, fat: null, muscle: null, protein: null, source: 'self' });
    expect(ob.contact).toEqual({ phone: PHONE, email: null });
    expect(ob.welcomed).toBe(false);
    /* the same object rides on /client/me, so every tab reads one truth */
    const me = (await get('/client/me')).body.data.onboarding;
    expect(me.told.goals).toEqual(['Sleep better', 'Lose 4 kg']);
  });
});
