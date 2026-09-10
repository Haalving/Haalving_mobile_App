import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { COINS_PER_DAY, VISIT_REASON } from '../src/services/client-app/gamification.js';
import { calendarDay, dateAdd, todayISO } from '../src/utils/dates.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp } from './helpers.js';

/**
 * OPENING THE APP IS THE STREAK'S UNIT, AND THE FIRST OPEN OF A DAY IS COINS.
 *
 * The check-in is idempotent within a day, the streak is the run of opened
 * days ending today, and every coin arrives through the ledger. The arrival
 * sheet's contract rides on the same client: today's answer can be refined,
 * cleared, and the seven-day strip reads it back.
 */

const PHONE = '+919000000774';
let token: string;
let userId: string;
let clientId: string;

beforeAll(async () => {
  await clearRateLimits();
  const u = await prisma.user.create({
    data: { role: 'client', name: 'Ported acceptance — check-in', phone: PHONE, status: 'active' },
    select: { id: true },
  });
  userId = u.id;
  const c = await prisma.client.create({
    data: {
      name: 'Ported acceptance — check-in',
      plan: 'POORNA',
      status: 'active',
      observation: false,
      cycle: 1,
      cycleDay: 6,
      cycleStart: calendarDay(dateAdd(todayISO(), -5)),
      onboardedAt: new Date(),
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
  await prisma.clientMood.deleteMany({ where: { clientId } });
  await prisma.coinEntry.deleteMany({ where: { clientId } });
  await prisma.clientVisit.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.otp.deleteMany({ where: { phone: PHONE } });
  await prisma.user.delete({ where: { id: userId } });
  await closeConnections();
});

const post = (path: string, body?: object) => request(app).post(`/api/v1${path}`).set(...auth(token)).send(body ?? {});
const get = (path: string) => request(app).get(`/api/v1${path}`).set(...auth(token));
const del = (path: string) => request(app).delete(`/api/v1${path}`).set(...auth(token));

describe('the daily check-in', () => {
  it('the first open of a day writes the visit and ten coins; the second changes nothing', async () => {
    const first = await post('/client/checkin');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.awarded).toBe(COINS_PER_DAY);
    expect(first.body.data.coins).toBe(COINS_PER_DAY);
    expect(first.body.data.streak.days).toBe(1);
    expect(first.body.data.streak.kept).toHaveLength(7);
    expect(first.body.data.streak.kept[6]).toBe(true);

    const again = await post('/client/checkin');
    expect(again.status).toBe(200);
    expect(again.body.data.awarded).toBe(0);
    expect(again.body.data.coins).toBe(COINS_PER_DAY);

    const ledger = await prisma.coinEntry.findMany({ where: { clientId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ amount: COINS_PER_DAY, reason: VISIT_REASON });
    const row = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { coins: true } });
    expect(row.coins).toBe(COINS_PER_DAY);
  });

  it('/client/me carries the balance and the run, which yesterday extends', async () => {
    await prisma.clientVisit.create({ data: { clientId, date: calendarDay(dateAdd(todayISO(), -1)) } });
    const me = await get('/client/me');
    expect(me.status).toBe(200);
    expect(me.body.data.coins).toBe(COINS_PER_DAY);
    expect(me.body.data.streak.days).toBe(2);
    expect(me.body.data.streak.kept.slice(5)).toEqual([true, true]);
  });

  it('a gap before yesterday ends the run there', async () => {
    await prisma.clientVisit.create({ data: { clientId, date: calendarDay(dateAdd(todayISO(), -3)) } });
    const me = await get('/client/me');
    expect(me.body.data.streak.days).toBe(2);
    expect(me.body.data.streak.kept[3]).toBe(true);
    expect(me.body.data.streak.kept[4]).toBe(false);
  });
});

describe('the arrival, as the sheet works it', () => {
  it('answers, refines the same morning, and reads back on the strip', async () => {
    const first = await post('/client/arrival', { mood: 'happy', note: 'slept well' });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const second = await post('/client/arrival', { mood: 'drained' });
    expect(second.status).toBe(200);
    expect(second.body.data.mood).toBe('drained');
    expect(second.body.data.note).toBeNull();

    const rows = await prisma.clientMood.count({ where: { clientId } });
    expect(rows).toBe(1);

    const today = await get('/client/today');
    expect(today.status).toBe(200);
    expect(today.body.data.arrival.mood).toBe('drained');
    expect(today.body.data.arrival.note).toBeNull();
    const strip = today.body.data.arrival.strip as Array<{ day: number; mood: string | null; today: boolean }>;
    expect(strip).toHaveLength(7);
    expect(strip[6]).toMatchObject({ day: 6, mood: 'drained', today: true });
    expect(strip[0]?.day ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('clears today, and the band reads unanswered again', async () => {
    const res = await del('/client/arrival');
    expect(res.status).toBe(200);
    const today = await get('/client/today');
    expect(today.body.data.arrival.mood).toBeNull();
    expect(await prisma.clientMood.count({ where: { clientId } })).toBe(0);
  });
});
