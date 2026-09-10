import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { OBSERVATION_DAYS } from '../src/services/client-app/rules.js';
import { calendarDay, dateAdd, todayISO } from '../src/utils/dates.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp } from './helpers.js';

/**
 * OBSERVATION ENDS BY THE CALENDAR.
 *
 * Promotion writes `observation: true`; nothing used to clear it, so a client
 * was capture-only for ever and never saw the plan their team assigned. Now the
 * window is the first five days of the first cycle, the first read past it
 * clears the cached flag, and the app stops hiding the plan.
 */

const PHONE = '+919000000772';
let token: string;
let userId: string;
let clientId: string;

const DAY = 86_400_000;

beforeAll(async () => {
  await clearRateLimits();
  const u = await prisma.user.create({
    data: { role: 'client', name: 'Ported acceptance — observation over', phone: PHONE, status: 'active' },
    select: { id: true },
  });
  userId = u.id;
  /* promoted six days ago: cycle 1, and the calendar says day 6 */
  const c = await prisma.client.create({
    data: {
      name: 'Ported acceptance — observation over',
      plan: 'POORNA',
      status: 'active',
      observation: true,
      cycle: 1,
      cycleDay: 1,
      cycleStart: calendarDay(dateAdd(todayISO(), -OBSERVATION_DAYS)),
      onboardedAt: new Date(Date.now() - OBSERVATION_DAYS * DAY),
      userId,
    },
    select: { id: true },
  });
  clientId = c.id;

  await issueTestOtp(PHONE, '123456');
  const res = await request(app)
    .post('/api/v1/auth/client/otp/verify')
    .set('X-Client', 'mobile')
    .send({ phone: PHONE, code: '123456' });
  expect(res.status, 'otp verify').toBe(200);
  token = res.body.data.accessToken as string;
});

afterAll(async () => {
  await prisma.clientPlan.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.otp.deleteMany({ where: { phone: PHONE } });
  await prisma.user.delete({ where: { id: userId } });
  await closeConnections();
});

const get = (path: string) => request(app).get(`/api/v1${path}`).set(...auth(token));

describe('a client past day five is no longer in observation', () => {
  it('reads day 6 of cycle 1 and observation false on /client/me, and clears the flag', async () => {
    const me = await get('/client/me');
    expect(me.status).toBe(200);
    expect(me.body.data.cycle).toBe(1);
    expect(me.body.data.day).toBe(OBSERVATION_DAYS + 1);
    expect(me.body.data.observation).toBe(false);

    const row = await prisma.client.findUnique({ where: { id: clientId }, select: { observation: true, cycleDay: true } });
    expect(row?.observation).toBe(false);
    expect(row?.cycleDay).toBe(OBSERVATION_DAYS + 1);
  });

  it('serves Today as a live day, not the capture-only branch', async () => {
    const today = await get('/client/today');
    expect(today.status).toBe(200);
    expect(today.body.data.observation).toBe(false);
    expect(today.body.data.day).toBe(OBSERVATION_DAYS + 1);
  });
});
