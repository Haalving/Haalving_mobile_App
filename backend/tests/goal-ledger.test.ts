import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { calendarDay, dateAdd, todayISO } from '../src/utils/dates.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp, loginStaff, type Session } from './helpers.js';

/**
 * THE GOAL LEDGER IS WRITTEN BY TWO SEATS.
 *
 * The Operations Head sets the goal and its seven targets at Day-1 goal
 * setting. A coach seated on the pod records one level's result and verdict at
 * the review — and may not move a target or the goal. A coach who is not on the
 * pod cannot write it at all. The client reads the same ledger on their Plan,
 * so what the console writes is what the phone shows.
 */

const PHONE = '+919000000773';
let ops: Session;
let dietitian: Session;
let outsider: Session;
let userId: string;
let clientId: string;
let clientToken: string;

const LEDGER = [1, 2, 3, 4, 5, 6, 7].map((level) => ({
  level,
  target: level === 4 || level === 5 ? '−1.5 kg' : '−1.0 kg',
  state: level === 1 ? 'cur' : 'todo',
}));

beforeAll(async () => {
  await clearRateLimits();
  [ops, dietitian, outsider] = await Promise.all([loginStaff('sureshk'), loginStaff('sneha'), loginStaff('lakshmi')]);

  const u = await prisma.user.create({
    data: { role: 'client', name: 'Ported acceptance — goal ledger', phone: PHONE, status: 'active' },
    select: { id: true },
  });
  userId = u.id;
  const c = await prisma.client.create({
    data: {
      name: 'Ported acceptance — goal ledger',
      plan: 'POORNA',
      status: 'active',
      observation: false,
      cycle: 1,
      cycleDay: 6,
      cycleStart: calendarDay(dateAdd(todayISO(), -5)),
      onboardedAt: new Date(),
      goal: 'Lose 8 kg',
      userId,
    },
    select: { id: true },
  });
  clientId = c.id;
  await prisma.podSeat.create({ data: { clientId, seat: 'dietitian', staffId: dietitian.user.id } });

  await issueTestOtp(PHONE, '123456');
  const res = await request(app)
    .post('/api/v1/auth/client/otp/verify')
    .set('X-Client', 'mobile')
    .send({ phone: PHONE, code: '123456' });
  expect(res.status, 'otp verify').toBe(200);
  clientToken = res.body.data.accessToken as string;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { subjectId: clientId } });
  await prisma.podSeat.deleteMany({ where: { clientId } });
  await prisma.clientPlan.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.otp.deleteMany({ where: { phone: PHONE } });
  await prisma.user.delete({ where: { id: userId } });
  await closeConnections();
});

const put = (s: Session, body: object) =>
  request(app).put(`/api/v1/clients/${clientId}/goal`).set(...auth(s.accessToken)).send(body);
const record = (s: Session) => request(app).get(`/api/v1/clients/${clientId}`).set(...auth(s.accessToken));

describe('the goal ledger', () => {
  it('the Operations Head sets the goal and seven targets, and the record reads them back', async () => {
    const res = await put(ops, {
      goal: 'Bring HbA1c under 6.5 and lose 8 kg',
      purpose: 'Trek with my kids at 60.',
      ledger: LEDGER,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const rec = await record(ops);
    expect(rec.status).toBe(200);
    expect(rec.body.data.goal).toBe('Bring HbA1c under 6.5 and lose 8 kg');
    expect(rec.body.data.purpose).toBe('Trek with my kids at 60.');
    expect(rec.body.data.goalLedger).toHaveLength(7);
    expect(rec.body.data.goalLedger[0]).toMatchObject({ level: 1, target: '−1.0 kg', state: 'cur' });
    expect(typeof rec.body.data.reviewDay).toBe('number');
  });

  it('the dietitian on the pod records a result and a verdict, but cannot move a target or the goal', async () => {
    const withResult = LEDGER.map((r) => (r.level === 1 ? { ...r, result: '−1.2 kg', state: 'ok' } : r));
    const ok = await put(dietitian, { ledger: withResult });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.goalLedger[0]).toMatchObject({ level: 1, target: '−1.0 kg', result: '−1.2 kg', state: 'ok' });

    const moved = await put(dietitian, {
      ledger: withResult.map((r) => (r.level === 2 ? { ...r, target: '−3.0 kg' } : r)),
    });
    expect(moved.status).toBe(403);

    const goalMoved = await put(dietitian, { goal: 'Something else', ledger: withResult });
    expect(goalMoved.status).toBe(403);

    const rec = await record(ops);
    expect(rec.body.data.goal).toBe('Bring HbA1c under 6.5 and lose 8 kg');
    expect(rec.body.data.goalLedger[1]).toMatchObject({ level: 2, target: '−1.0 kg' });
  });

  it('a coach who is not on the pod is refused', async () => {
    const res = await put(outsider, { ledger: LEDGER });
    /* 404 when the client is outside their scope, 403 when they can see but not write */
    expect([403, 404]).toContain(res.status);
    const rec = await record(ops);
    expect(rec.body.data.goalLedger[0]).toMatchObject({ result: '−1.2 kg', state: 'ok' });
  });

  it('the client reads the same ledger on their Plan', async () => {
    const res = await request(app).get('/api/v1/client/plan').set(...auth(clientToken));
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.data.goal).toBe('Bring HbA1c under 6.5 and lose 8 kg');
    expect(res.body.data.ledger).toHaveLength(7);
    expect(res.body.data.ledger[0]).toMatchObject({ level: 'L1', target: '−1.0 kg', result: '−1.2 kg', state: 'ok' });
  });
});
