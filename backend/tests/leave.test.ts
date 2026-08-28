import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addDays, todayISO } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * Time & Cover, exercised through the API.
 *
 * The seeded state is the demo's boot state: Sneha's leave APPROVED and live today
 * with Divya covering two of her clients, and Vikram's already sitting under NEEDS
 * A COVER PLAN. These tests walk a leave through all four steps and back again.
 */

let vikram: Session; /* the applicant */
let anita: Session; /* Super Admin — the approver, and Ops-wide team scope */
let sneha: Session; /* Dietician — neither approver nor on the fitness bench */
let lakshmi: Session; /* Yoga Coach — no team scope at all */

const TODAY = todayISO();
const D = (n: number) => addDays(TODAY, n);

/** The seeded leaves, which the reset restores. */
const SEEDED = ['lv-0', 'lv-1'];

/**
 * One sign-in per person for the whole file.
 *
 * The four-step tests each need whoever the board offered, and signing in per test
 * walks straight into the sign-in rate limiter — which is the product behaving
 * correctly, and not something to relax for a test suite.
 */
const sessions = new Map<string, Session>();
async function sessionFor(handle: string): Promise<Session> {
  const hit = sessions.get(handle);
  if (hit) return hit;
  const s = await loginStaff(handle);
  sessions.set(handle, s);
  return s;
}

async function reset(): Promise<void> {
  await prisma.leave.deleteMany({ where: { id: { notIn: SEEDED } } });
  await prisma.notice.deleteMany({});
  await prisma.taskException.deleteMany({ where: { leaveId: { not: null } } });

  /* lv-1 is Vikram's, and every test that plans or approves it has to find it
     back on the board */
  await prisma.leaveReallocation.deleteMany({ where: { leaveId: 'lv-1' } });
  await prisma.leaveSessionCover.deleteMany({ where: { leaveId: 'lv-1' } });
  await prisma.leaveCoverResponse.deleteMany({ where: { leaveId: 'lv-1' } });
  await prisma.podCover.deleteMany({ where: { leaveId: 'lv-1' } });
  await prisma.leaveEvent.deleteMany({ where: { leaveId: 'lv-1', act: { not: 'APPLIED' } } });
  await prisma.leave.update({
    where: { id: 'lv-1' },
    data: { status: 'REASSIGN', declineReason: null, from: dayOf(3), to: dayOf(5) },
  });
}

function dayOf(n: number): Date {
  return new Date(`${D(n)}T00:00:00.000Z`);
}

beforeAll(async () => {
  await clearRateLimits();
  [vikram, anita, sneha, lakshmi] = await Promise.all([
    loginStaff('vikram'),
    loginStaff('anita'),
    loginStaff('sneha'),
    loginStaff('lakshmi'),
  ]);
});

afterAll(async () => {
  await reset();
  await closeConnections();
});

beforeEach(reset);

const api = (s: Session) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set(...auth(s.accessToken)),
  post: (path: string, body?: object) =>
    request(app)
      .post(`/api/v1${path}`)
      .set(...auth(s.accessToken))
      .send(body ?? {}),
  put: (path: string, body: object) =>
    request(app)
      .put(`/api/v1${path}`)
      .set(...auth(s.accessToken))
      .send(body),
});

/* ────────────────────────────────────────────────────── availability */

describe('availability', () => {
  it('takes a split shift and reports two windows', async () => {
    const res = await api(vikram).put('/availability/me', {
      mon: [
        ['06:00', '09:00'],
        ['17:00', '20:00'],
      ],
      sun: null,
    });
    expect(res.status).toBe(200);
    expect((res.body.data.avail as { mon: unknown[] }).mon).toHaveLength(2);
  });

  it('refuses two windows that overlap on one day', async () => {
    const res = await api(vikram).put('/availability/me', {
      mon: [
        ['06:00', '12:00'],
        ['10:00', '14:00'],
      ],
    });
    expect(res.status).toBe(400);
  });

  it('refuses a window off the quarter hour', async () => {
    expect((await api(vikram).put('/availability/me', { mon: [['06:07', '09:00']] })).status).toBe(
      400,
    );
  });

  it('refuses a window that ends before it starts', async () => {
    expect((await api(vikram).put('/availability/me', { mon: [['12:00', '09:00']] })).status).toBe(
      400,
    );
  });

  it('is not somebody else’s to rewrite', async () => {
    const res = await api(lakshmi).put('/availability/u-vikram', { mon: [['06:00', '09:00']] });
    expect(res.status).toBe(403);

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'denied', subjectType: 'availability', actorId: 'u-lakshmi' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
  });

  it('lets managePeople edit anybody’s', async () => {
    expect((await api(anita).put('/availability/u-vikram', { mon: [['06:00', '09:00']] })).status).toBe(
      200,
    );
    /* put it back, or every later conflict assertion shifts */
    await api(anita).put('/availability/u-vikram', {
      mon: [['06:00', '10:00'], ['17:00', '21:00']],
      tue: [['06:00', '10:00'], ['17:00', '21:00']],
      wed: [['06:00', '10:00'], ['17:00', '21:00']],
      thu: [['06:00', '10:00'], ['17:00', '21:00']],
      fri: [['06:00', '10:00'], ['17:00', '21:00']],
      sat: [['06:00', '10:00']],
      sun: null,
    });
  });
});

/* ────────────────────────────────────────────────────────── applying */

describe('applying', () => {
  it('refuses leave that overlaps leave already on file', async () => {
    /* lv-1 already covers D(3)..D(5) */
    const res = await api(vikram).post('/leave', {
      from: D(4),
      to: D(6),
      reason: 'Something else entirely',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already have leave on file/);
  });

  it('takes a clear window, lands on REASSIGN and tells the board', async () => {
    const res = await api(vikram).post('/leave', {
      from: D(20),
      to: D(21),
      reason: 'Family function in Kochi',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('REASSIGN');

    const ev = await prisma.leaveEvent.findFirst({ where: { leaveId: res.body.data.id } });
    expect(ev!.act).toBe('APPLIED');

    /* the fitness bench has no HoD, so it goes to the Ops Head */
    const notices = await prisma.notice.findMany({ where: { kind: 'LEAVE' } });
    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0]!.text).toMatch(/applied for leave/);
  });

  it('refuses a reason too short to act on', async () => {
    expect(
      (await api(vikram).post('/leave', { from: D(20), to: D(21), reason: 'x' })).status,
    ).toBe(400);
  });

  it('refuses a window that ends before it begins', async () => {
    expect(
      (await api(vikram).post('/leave', { from: D(21), to: D(20), reason: 'Backwards' })).status,
    ).toBe(400);
  });

  it('lets the applicant withdraw before it is decided', async () => {
    const made = await api(vikram).post('/leave', { from: D(20), to: D(21), reason: 'Maybe not' });
    const res = await api(vikram).post(`/leave/${made.body.data.id}/withdraw`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('WITHDRAWN');
  });

  it('refuses a withdrawal of somebody else’s leave', async () => {
    expect((await api(sneha).post('/leave/lv-1/withdraw')).status).toBe(403);
  });
});

/* ──────────────────────────────────────────────────── the cover board */

describe('the cover board', () => {
  it('lists the riding clients, the bench and the sessions', async () => {
    const res = await api(anita).get('/leave/lv-1/board');
    expect(res.status).toBe(200);

    expect(res.body.data.seatKey).toBe('fitness');
    expect(res.body.data.riding.length).toBeGreaterThan(0);

    /* the bench never contains the applicant */
    const ids = res.body.data.bench.map((b: { id: string }) => b.id);
    expect(ids).not.toContain('u-vikram');

    /* every candidate carries a reason per session */
    for (const b of res.body.data.bench) {
      expect(typeof b.loadWords).toBe('string');
      expect(b).toHaveProperty('sameLevel');
    }
  });

  it('sorts the applicant’s own level first', async () => {
    const res = await api(anita).get('/leave/lv-1/board');
    const bench = res.body.data.bench as Array<{ sameLevel: boolean }>;
    if (bench.length > 1) {
      const firstFalse = bench.findIndex((b) => !b.sameLevel);
      const lastTrue = bench.map((b) => b.sameLevel).lastIndexOf(true);
      if (firstFalse >= 0 && lastTrue >= 0) expect(lastTrue).toBeLessThan(firstFalse);
    }
  });

  it('is not open to a role with no team scope', async () => {
    const res = await api(lakshmi).get('/leave/lv-1/board');
    expect(res.status).toBe(403);
    const logged = await prisma.auditLog.findFirst({
      where: { action: 'denied', subjectType: 'leave', actorId: 'u-lakshmi' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
  });

  it('refuses a plan that leaves a client without a name', async () => {
    const res = await api(anita).post('/leave/lv-1/plan', { reallocations: [], sessions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/needs a name/);
  });
});

/* ─────────────────────────────────────────────────── the four steps */

describe('the four steps', () => {
  /** Plan lv-1 with whoever the board offers first. */
  async function planIt() {
    const board = await api(anita).get('/leave/lv-1/board');
    const cover = board.body.data.bench[0] as { id: string; name: string };
    expect(cover, 'the fitness bench should have somebody on it').toBeTruthy();

    const res = await api(anita).post('/leave/lv-1/plan', {
      reallocations: board.body.data.riding.map((r: { clientId: string }) => ({
        clientId: r.clientId,
        toId: cover.id,
      })),
      sessions: board.body.data.sessions.map((s: { taskId: string; date: string }) => ({
        taskId: s.taskId,
        date: s.date,
        toId: cover.id,
      })),
    });
    return { res, cover, board: board.body.data };
  }

  it('moves REASSIGN → ACCEPT and asks the named cover', async () => {
    const { res, cover } = await planIt();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACCEPT');

    const responses = await prisma.leaveCoverResponse.findMany({ where: { leaveId: 'lv-1' } });
    expect(responses).toHaveLength(1);
    expect(responses[0]!.userId).toBe(cover.id);
    expect(responses[0]!.state).toBe('PENDING');

    const asked = await prisma.notice.findFirst({ where: { toId: cover.id, kind: 'LEAVE' } });
    expect(asked!.text).toMatch(/asked to cover for Vikram/);
  });

  it('shows the cover their own packet with a pill per session', async () => {
    const { cover } = await planIt();
    const who = await sessionFor(cover.id.replace(/^u-/, ''));
    const mine = await api(who).get('/leave/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.data.toAccept).toHaveLength(1);
    for (const s of mine.body.data.toAccept[0].sessions) {
      expect(['free', 'already booked', 'on leave', 'outside their hours']).toContain(s.reason);
    }
  });

  it('sends the WHOLE plan back on a decline, and tells both sides', async () => {
    const { cover } = await planIt();
    const who = await sessionFor(cover.id.replace(/^u-/, ''));

    const res = await api(who).post('/leave/lv-1/respond', { accept: false });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REASSIGN');

    const toApplicant = await prisma.notice.findFirst({ where: { toId: 'u-vikram', kind: 'LEAVE' } });
    expect(toApplicant!.text).toMatch(/cannot take the cover — back to the board/);
  });

  it('moves ACCEPT → PENDING on the last acceptance and calls the approver', async () => {
    const { cover } = await planIt();
    const who = await sessionFor(cover.id.replace(/^u-/, ''));

    const res = await api(who).post('/leave/lv-1/respond', { accept: true });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');

    const toApprover = await prisma.notice.findFirst({ where: { toId: 'u-anita', kind: 'LEAVE' } });
    expect(toApprover!.text).toMatch(/your signature is next/);
  });

  it('refuses a response from somebody nobody asked', async () => {
    await planIt();
    const res = await api(sneha).post('/leave/lv-1/respond', { accept: true });
    expect(res.status).toBe(403);
  });

  it('refuses an approval from somebody who is not the approver', async () => {
    const { cover } = await planIt();
    const who = await sessionFor(cover.id.replace(/^u-/, ''));
    await api(who).post('/leave/lv-1/respond', { accept: true });

    const res = await api(sneha).post('/leave/lv-1/approve');
    expect(res.status).toBe(403);
    expect((await prisma.leave.findUnique({ where: { id: 'lv-1' } }))!.status).toBe('PENDING');
  });

  it('writes the covers and the session swaps on one signature', async () => {
    const { cover, board } = await planIt();
    const who = await sessionFor(cover.id.replace(/^u-/, ''));
    await api(who).post('/leave/lv-1/respond', { accept: true });

    const res = await api(anita).post('/leave/lv-1/approve');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    const covers = await prisma.podCover.findMany({ where: { leaveId: 'lv-1' } });
    expect(covers).toHaveLength(board.riding.length);
    for (const c of covers) expect(c.coverId).toBe(cover.id);

    const swaps = await prisma.taskException.findMany({ where: { leaveId: 'lv-1' } });
    expect(swaps).toHaveLength(board.sessions.length);
    for (const s of swaps) {
      expect(s.coachSwap).toMatchObject({ fromId: 'u-vikram', toId: cover.id });
      /* the OCCURRENCE, never the series */
      expect(s.date).toBeInstanceOf(Date);
    }
  });

  it('refuses a decline without a reason, and records one with', async () => {
    const { cover } = await planIt();
    const who = await sessionFor(cover.id.replace(/^u-/, ''));
    await api(who).post('/leave/lv-1/respond', { accept: true });

    expect((await api(anita).post('/leave/lv-1/decline', { reason: '' })).status).toBe(400);

    const res = await api(anita).post('/leave/lv-1/decline', { reason: 'Too many away that week' });
    expect(res.status).toBe(200);
    const row = await prisma.leave.findUnique({ where: { id: 'lv-1' } });
    expect(row!.status).toBe('DECLINED');
    expect(row!.declineReason).toBe('Too many away that week');
  });
});

/* ─────────────────────────────────────────────── the cover in force */

describe('the seeded cover, live today', () => {
  it('hands Sneha’s clients to Divya while the window runs', async () => {
    const divya = await sessionFor('divya');
    const res = await api(divya).get('/clients');
    const names = res.body.data.map((c: { name: string }) => c.name);
    expect(names).toContain('Rajesh D.');
    expect(names).toContain('Suresh P.');
  });

  it('leaves the owner her own list — she is coming back', async () => {
    const res = await api(sneha).get('/clients');
    expect(res.body.data.map((c: { name: string }) => c.name)).toContain('Rajesh D.');
  });

  it('shows under COVERS RUNNING TODAY', async () => {
    const res = await api(anita).get('/leave/team');
    expect(res.status).toBe(200);
    expect(res.body.data.runningToday.length).toBeGreaterThan(0);
    const row = res.body.data.runningToday[0];
    expect(row.coverName).toBe('Divya R.');
    expect(row.ownerName).toBe('Sneha M.');
  });

  it('counts what rides on a seat before it is planned', async () => {
    const res = await api(anita).get('/leave/team');
    const vik = res.body.data.needsPlan.find((l: { staffId: string }) => l.staffId === 'u-vikram');
    expect(vik).toBeTruthy();
    expect(vik.ridingCount).toBeGreaterThan(0);
  });

  it('is closed to a role with no team scope', async () => {
    expect((await api(lakshmi).get('/leave/team')).status).toBe(403);
  });
});
